begin;
do $$
declare owner_id uuid; result jsonb; mission jsonb; progress jsonb; template record; tested integer := 0;
begin
    if has_function_privilege('anon','public.get_weekly_mission_state_v4()','EXECUTE') then
        raise exception 'Anonymous mission access must be denied';
    end if;
    if has_function_privilege('authenticated','public.cob_weekly_player_payload_v2(uuid)','EXECUTE') then
        raise exception 'Callers must not read arbitrary accounts through the internal helper';
    end if;
    select id into owner_id from public.profiles where public.cob_weekly_player_payload_v2(id) is not null limit 1;
    if owner_id is null then raise exception 'No linked test profile with complete statistics'; end if;
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    result := public.get_weekly_mission_state_v4();
    if result->'stats_profile' is null or jsonb_array_length(result->'missions') = 0 then
        raise exception 'Missing mission snapshot';
    end if;
    for mission in select value from jsonb_array_elements(result->'missions') loop
        progress := public.cob_weekly_requirement_progress_v3(owner_id,mission);
        if progress->'value' is distinct from mission#>'{serverProgress,value}'
            or progress->'complete' is distinct from mission#>'{serverProgress,complete}' then
            raise exception 'Displayed progress disagrees with reward validation';
        end if;
    end loop;
    for template in select * from public.weekly_mission_templates where active loop
        mission := to_jsonb(template) || jsonb_build_object('mode',case when template.mode='random' then 'battleRoyale' else template.mode end,
            'baseline', case when template.requirements->>'type' in ('all','distinct') then '{"values":{}}'::jsonb else '0'::jsonb end);
        progress := public.cob_weekly_requirement_progress_v3(owner_id,mission);
        if jsonb_typeof(progress->'value') <> 'number' or jsonb_typeof(progress->'complete') <> 'boolean'
            or (progress->>'value')::numeric < 0 then raise exception 'Invalid template progress: %',template.id; end if;
        tested := tested+1;
    end loop;
    if tested = 0 then raise exception 'No mission templates tested'; end if;
    if public.cob_mission_merge_stats_v4('{"kills":2,"bestKillStreak":4,"weeklyCounters":{"x":3}}',
        '{"kills":3,"bestKillStreak":2,"weeklyCounters":{"x":1}}')
        <> '{"kills":5,"bestKillStreak":4,"weeklyCounters":{"x":4}}'::jsonb then raise exception 'Split-mode merge failed'; end if;
end $$;
rollback;
