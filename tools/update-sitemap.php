<?php
declare(strict_types=1);

// This maintenance command must never scan the site through an HTTP request.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

if (PHP_VERSION_ID < 80100) {
    fwrite(STDERR, "PHP 8.1 or newer is required.\n");
    exit(1);
}

function sitemapAttributes(string $tag): array
{
    preg_match_all(
        '~\s+([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s"\x27=<>`]+)))?~',
        $tag,
        $matches,
        PREG_SET_ORDER | PREG_UNMATCHED_AS_NULL
    );
    $attributes = [];
    foreach ($matches as $match) {
        $name = strtolower($match[1]);
        // Keep the first occurrence, matching HTML's duplicate-attribute handling.
        if (!array_key_exists($name, $attributes)) {
            $attributes[$name] = html_entity_decode($match[2] ?? $match[3] ?? $match[4] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }
    return $attributes;
}

function sitemapPageIsIndexable(string $file, string $url): bool
{
    $html = @file_get_contents($file);
    if ($html === false) {
        throw new RuntimeException("Cannot read HTML: {$file}");
    }
    if (!preg_match('~<head\b[^>]*>(.*?)</head\s*>~is', $html, $head)) {
        return true;
    }
    // Ignore examples inside comments and inline code; inspect metadata in head only.
    $metadata = preg_replace('~<!--[\s\S]*?-->|<(script|style|title)\b[^>]*>[\s\S]*?</\1\s*>~i', '', $head[1]);
    preg_match_all('~<(?:meta|link)\b(?:[^>"\x27]|"[^"]*"|\x27[^\x27]*\x27)*>~i', $metadata ?? '', $tags);
    foreach ($tags[0] as $tag) {
        $attributes = sitemapAttributes($tag);
        if (preg_match('~^<meta\b~i', $tag)
            && strtolower(trim($attributes['name'] ?? '')) === 'robots'
            && preg_match('~(?:^|[\s,;])noindex(?:$|[\s,;])~i', $attributes['content'] ?? '')) {
            return false;
        }
        if (preg_match('~^<link\b~i', $tag)
            && preg_match('~(?:^|\s)canonical(?:$|\s)~i', trim($attributes['rel'] ?? ''))
            && trim($attributes['href'] ?? '') !== $url) {
            fwrite(STDERR, "Skipped mismatched canonical: {$file}\n");
            return false;
        }
    }
    return true;
}

function sitemapScan(string $directory, string $relative, array &$urls): void
{
    $entries = @scandir($directory);
    if ($entries === false) {
        throw new RuntimeException("Cannot scan directory: {$directory}");
    }
    $excluded = ['archive', 'assets', 'docs', 'scripts', 'content', 'tools'];
    foreach ($entries as $entry) {
        if ($entry === '' || $entry[0] === '.') {
            continue;
        }
        $path = $directory . DIRECTORY_SEPARATOR . $entry;
        if (is_link($path)) {
            continue;
        }
        if (is_dir($path)) {
            if (!in_array(strtolower($entry), $excluded, true)) {
                sitemapScan($path, $relative . $entry . '/', $urls);
            }
            continue;
        }
        if (!is_file($path) || !preg_match('~\.html$~i', $entry)) {
            continue;
        }
        $urlPath = $relative . $entry;
        if ($entry === 'index.html') {
            $urlPath = $relative;
        }
        $url = 'https://simfer.com.ru/' . implode('/', array_map('rawurlencode', explode('/', $urlPath)));
        if (sitemapPageIsIndexable($path, $url)) {
            $urls[$url] = true;
        }
    }
}

$temporary = null;
$lock = null;
$exitCode = 0;
try {
    $root = realpath(dirname(__DIR__));
    if ($root === false) {
        throw new RuntimeException('Cannot resolve site root.');
    }
    $lockPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'simfer-sitemap-' . hash('sha256', $root) . '.lock';
    $lock = @fopen($lockPath, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        throw new RuntimeException('Cannot acquire sitemap lock.');
    }
    $urls = [];
    sitemapScan($root, '', $urls);
    ksort($urls, SORT_STRING);
    $xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    $xml .= "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    foreach ($urls as $url => $_) {
        $escaped = htmlspecialchars($url, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $xml .= "  <url><loc>{$escaped}</loc></url>\n";
    }
    $xml .= "</urlset>\n";
    $temporary = @tempnam($root, '.sitemap-');
    if ($temporary === false || dirname($temporary) !== $root) {
        throw new RuntimeException('Cannot create temporary sitemap in site root.');
    }
    if (@file_put_contents($temporary, $xml) !== strlen($xml) || !@chmod($temporary, 0644)) {
        throw new RuntimeException('Cannot write temporary sitemap.');
    }
    $destination = $root . DIRECTORY_SEPARATOR . 'sitemap.xml';
    if (!@rename($temporary, $destination)) {
        throw new RuntimeException('Cannot atomically replace sitemap.xml.');
    }
    $temporary = null;
    fwrite(STDOUT, count($urls) . " URLs written to {$destination}\n");
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    $exitCode = 1;
} finally {
    if (is_string($temporary) && is_file($temporary)) {
        @unlink($temporary);
    }
    if (is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
exit($exitCode);
