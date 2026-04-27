$listener = [System.Net.HttpListener]::new()
$prefix = "http://localhost:4173/"
$listener.Prefixes.Add($prefix)
$listener.Start()

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Call of Block stats preview running at $prefix"
Write-Host "Press Ctrl+C to stop."

$contentTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestPath = $context.Request.Url.AbsolutePath.TrimStart("/")
        if ([string]::IsNullOrWhiteSpace($requestPath)) {
            $requestPath = "index.html"
        }

        $relativePath = $requestPath.Replace("/", "\")
        $safePath = Join-Path $root $relativePath
        $fullPath = [System.IO.Path]::GetFullPath($safePath)

        if (!$fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $fullPath)) {
            $context.Response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $context.Response.Close()
            continue
        }

        $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        $context.Response.ContentType = $contentTypes[$extension]
        if ([string]::IsNullOrWhiteSpace($context.Response.ContentType)) {
            $context.Response.ContentType = "application/octet-stream"
        }

        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $context.Response.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
