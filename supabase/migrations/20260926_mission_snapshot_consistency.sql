begin;

-- Mission readers and reward claims must use the same current, complete export.
create or replace function public.cob_mission_merge_stats_v4(a jsonb, b jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare result jsonb := coalesce(a, '{}'::jsonb); pair record; previous numeric;
begin
    for pair in select key, value from jsonb_each(coalesce(b, '{}'::jsonb)) loop
        if pair.key = 'weeklyCounters' then
            result := jsonb_set(result, array[pair.key], public.cob_mission_merge_stats_v4(result->pair.key, pair.value));
        elsif jsonb_typeof(pair.value) = 'number' then
            previous := public.cob_weekly_json_number_v3(result->pair.key);
            result := jsonb_set(result, array[pair.key], to_jsonb(case
                when pair.key in ('bestKillStreak','topMatchKills','longestKillDistance','longestSurvivalSeconds')
                then greatest(previous, (pair.value::text)::numeric)
                else previous + (pair.value::text)::numeric end));
        elsif not result ? pair.key then
            result := jsonb_set(result, array[pair.key], pair.value);
        end if;
    end loop;
    return result;
end $$;

create or replace function public.cob_mission_merge_rows_v4(a jsonb, b jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, public as $$
declare result jsonb := '{}'::jsonb; entry jsonb; key text;
begin
    for entry in select value from jsonb_array_elements(coalesce(a,'[]'::jsonb) || coalesce(b,'[]'::jsonb)) loop
        key := entry->>'id';
        if coalesce(key,'') = '' then continue; end if;
        result := jsonb_set(result, array[key], entry || jsonb_build_object('stats',
            public.cob_mission_merge_stats_v4(result->key->'stats', entry->'stats')));
    end loop;
    return coalesce((select jsonb_agg(item.value order by item.key) from jsonb_each(result) as item), '[]'::jsonb);
end $$;

create or replace function public.cob_weekly_player_payload_v2(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare player_id text; exports jsonb; core jsonb; weapons jsonb; maps jsonb;
        core_export jsonb; weapon_export jsonb; map_export jsonb;
        mode text; details jsonb; collection text; dm jsonb;
begin
    select minecraft_player_id into player_id from public.profiles where id = p_profile_id;
    if coalesce(player_id,'') = '' then return null; end if;
    select jsonb_object_agg(id,payload) into exports from public.cob_stats_exports
        where id in ('profile:'||player_id, 'profile:'||player_id||':weapons', 'profile:'||player_id||':maps', 'live');
    core_export := exports->('profile:'||player_id);
    if core_export is null then
        select value into core from jsonb_array_elements(coalesce(exports#>'{live,profiles}','[]'::jsonb))
            where value->>'playerId' = player_id limit 1;
    else
        weapon_export := exports->('profile:'||player_id||':weapons');
        map_export := exports->('profile:'||player_id||':maps');
        if weapon_export is null or map_export is null then return null; end if;
        -- A publishing batch can be in flight. Never combine two different generations.
        if core_export->>'generatedAt' is distinct from weapon_export->>'generatedAt'
            or core_export->>'generatedAt' is distinct from map_export->>'generatedAt' then return null; end if;
        select value into core from jsonb_array_elements(coalesce(core_export->'profiles','[]'::jsonb))
            where value->>'playerId'=player_id limit 1;
        select value into weapons from jsonb_array_elements(coalesce(weapon_export->'profiles','[]'::jsonb))
            where value->>'playerId'=player_id limit 1;
        select value into maps from jsonb_array_elements(coalesce(map_export->'profiles','[]'::jsonb))
            where value->>'playerId'=player_id limit 1;
        if core is null or weapons is null or maps is null then return null; end if;
        foreach mode in array array['battleRoyale','deathmatch','teamDeathmatch','freeForAll','duel','zombieSurvival'] loop
            if not core ? mode then continue; end if;
            details := coalesce(core->mode->'details','{}'::jsonb);
            if jsonb_typeof(weapons->mode->'details'->'weapons') = 'array' then
                details := details || jsonb_build_object('weapons',weapons->mode->'details'->'weapons');
            end if;
            foreach collection in array array['maps','deathmatchMaps','battleRoyaleMaps'] loop
                if jsonb_typeof(maps->mode->'details'->collection) = 'array' then
                    details := details || jsonb_build_object(collection,maps->mode->'details'->collection);
                end if;
            end loop;
            core := jsonb_set(core,array[mode,'details'],details);
        end loop;
    end if;
    if core is null then return null; end if;
    if core ? 'teamDeathmatch' or core ? 'freeForAll' then
        dm := jsonb_build_object('stats', public.cob_mission_merge_stats_v4(
            core#>'{teamDeathmatch,stats}', core#>'{freeForAll,stats}'), 'details', jsonb_build_object(
            'weapons',public.cob_mission_merge_rows_v4(core#>'{teamDeathmatch,details,weapons}',core#>'{freeForAll,details,weapons}'),
            'deathmatchMaps',public.cob_mission_merge_rows_v4(
                coalesce(nullif(core#>'{teamDeathmatch,details,maps}','[]'::jsonb),core#>'{teamDeathmatch,details,deathmatchMaps}'),
                coalesce(nullif(core#>'{freeForAll,details,maps}','[]'::jsonb),core#>'{freeForAll,details,deathmatchMaps}'))));
        core := core || jsonb_build_object('deathmatch',dm);
    end if;
    return core;
end $$;

create or replace function public.get_weekly_mission_state_v4()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare owner_id uuid := auth.uid(); row_data jsonb; profile jsonb; missions jsonb := '[]'::jsonb;
        mission jsonb; progress jsonb; part jsonb; parts jsonb; fraction numeric; index integer; current_value numeric; target numeric;
begin
    if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
    profile := public.cob_weekly_player_payload_v2(owner_id);
    if profile is null then
        -- Do not initialize or rotate baselines while an export is unavailable or partially published.
        raise exception 'Mission statistics are unavailable; retry after the export completes';
    end if;
    row_data := to_jsonb(public.ensure_weekly_missions_v2());
    for mission in select value from jsonb_array_elements(coalesce(row_data->'missions','[]'::jsonb)) loop
        progress := public.cob_weekly_requirement_progress_v3(owner_id,mission);
        fraction := least(1,public.cob_weekly_json_number_v3(progress->'value') / greatest(1,public.cob_weekly_json_number_v3(progress->'target')));
        if mission#>>'{requirements,type}' = 'all' then
            fraction := 0; index := 0; parts := '[]'::jsonb;
            for part in select value from jsonb_array_elements(mission#>'{requirements,components}') loop
                current_value := greatest(0,public.cob_weekly_metric_value_v2(owner_id,part->>'mode',part->>'metric','','')
                    - public.cob_weekly_json_number_v3(mission#>'{baseline,values}'->index));
                target := greatest(1,public.cob_weekly_json_number_v3(part->'target'));
                fraction := fraction + least(1,current_value/target);
                parts := parts || jsonb_build_array(part || jsonb_build_object('value',current_value,'target',target));
                index := index + 1;
            end loop;
            fraction := fraction/greatest(1,index);
            progress := progress || jsonb_build_object('parts',parts);
        end if;
        missions := missions || jsonb_build_array(mission || jsonb_build_object('serverProgress',progress || jsonb_build_object('progress',fraction)));
    end loop;
    return row_data || jsonb_build_object('missions',missions,'stats_profile',profile);
end $$;

revoke all on function public.cob_mission_merge_stats_v4(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.cob_mission_merge_rows_v4(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.cob_weekly_player_payload_v2(uuid) from public, anon, authenticated;
revoke all on function public.get_weekly_mission_state_v4() from public, anon;
grant execute on function public.get_weekly_mission_state_v4() to authenticated;
commit;
