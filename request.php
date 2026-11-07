<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');
header('Referrer-Policy: same-origin');
header('Vary: Accept');

$json = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
$values = ['company' => '', 'email' => '', 'message' => '', 'consent' => ''];
$token = '';

function escape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function respond(int $status, bool $ok, string $message): never
{
    global $json, $values, $token;
    http_response_code($status);
    if ($json) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['ok' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }
    header('Content-Type: text/html; charset=UTF-8');
    ?>
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Запрос на поставку | ТЕХНОЛАЙН ТРЕЙД</title>
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/seo.css">
  <script src="/assets/request.js" defer></script>
</head>
<body class="page-wrap">
<main class="container landing-hero seo-prose">
  <p><a href="/">ТЕХНОЛАЙН ТРЕЙД — на главную</a></p>
  <h1>Запрос на поставку</h1>
  <p>Пришлите спецификацию или ссылку на закупку — подготовим коммерческое предложение.</p>
  <form class="request-form ym-disable-keys" action="/request.php" method="post">
    <p class="form-status" role="status" aria-live="polite" tabindex="-1" data-state="<?= $ok ? 'success' : ($status >= 400 ? 'error' : 'idle') ?>"><?= escape($message) ?></p>
    <input type="hidden" name="csrf" value="<?= escape($token) ?>">
    <p><label>Организация (необязательно)<br>
      <input type="text" name="company" maxlength="200" autocomplete="organization" value="<?= escape($values['company']) ?>">
    </label></p>
    <p><label>Email для ответа<br>
      <input type="email" name="email" maxlength="254" autocomplete="email" required value="<?= escape($values['email']) ?>">
    </label></p>
    <p><label>Ссылка на закупку или спецификация<br>
      <textarea name="message" rows="8" minlength="10" maxlength="10000" required><?= escape($values['message']) ?></textarea>
    </label></p>
    <div hidden aria-hidden="true"><label>Не заполняйте это поле
      <input type="text" name="website" value="" tabindex="-1" autocomplete="off">
    </label></div>
    <p><label class="consent"><input type="checkbox" name="consent" value="1" required<?= $values['consent'] === '1' ? ' checked' : '' ?>>
      Разрешаю использовать указанный email для ответа на мой запрос.
    </label></p>
    <button class="btn request-submit" type="submit">Отправить запрос</button>
  </form>
  <p>Также можно написать на <a href="mailto:info@simfer.com.ru">info@simfer.com.ru</a>
    или позвонить: <a href="tel:+79785792995">+7 (978) 579-29-95</a>.</p>
</main>
</body>
</html>
    <?php
    exit;
}

function textLength(string $value): int
{
    $length = preg_match_all('/./us', $value);
    return $length === false ? PHP_INT_MAX : $length;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, false, 'Этот способ обращения не поддерживается. Откройте форму запроса.');
}

// Reject oversized input even when PHP has discarded a body above post_max_size.
if ($method === 'POST' && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 65536) {
    respond(413, false, 'Запрос слишком большой. Вставьте спецификацию текстом до 10 000 символов.');
}

if ($method === 'POST') {
    foreach ($values as $name => $unused) {
        if (isset($_POST[$name]) && is_string($_POST[$name])) {
            $values[$name] = $_POST[$name];
        }
    }
}

$secure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' && $_SERVER['HTTPS'] !== '')
    || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_name('simfer_request');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (!@session_start(['use_strict_mode' => 1, 'use_only_cookies' => 1])) {
    respond(503, false, 'Форма временно недоступна. Напишите на info@simfer.com.ru или позвоните +7 (978) 579-29-95.');
}
try {
    if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    $token = $_SESSION['csrf'];
} catch (Throwable $error) {
    respond(503, false, 'Форма временно недоступна. Напишите на info@simfer.com.ru или позвоните +7 (978) 579-29-95.');
}

if ($method === 'GET') {
    if ($json) {
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['csrf' => $token]);
        exit;
    }
    respond(200, false, 'Укажите email для ответа и описание необходимой поставки.');
}

$postedToken = $_POST['csrf'] ?? '';
if (!is_string($postedToken) || $postedToken === '' || !hash_equals($token, $postedToken)) {
    respond(403, false, 'Защитный код отсутствует или устарел. Данные не отправлены и сохранены в форме. Проверьте их и повторите отправку. Для работы формы разрешите cookies этого сайта.');
}

foreach (['company', 'email', 'message', 'consent', 'website'] as $name) {
    if (isset($_POST[$name]) && !is_string($_POST[$name])) {
        respond(422, false, 'Некорректный формат данных. Проверьте поля формы.');
    }
}
if (($_POST['website'] ?? '') !== '') {
    respond(422, false, 'Запрос не принят. Откройте форму заново или напишите на info@simfer.com.ru.');
}

$company = trim($values['company']);
$email = $values['email'];
$message = trim(str_replace(["\r\n", "\r"], "\n", $values['message']));
if (textLength($company) > 200 || preg_match('/[\x00-\x1F\x7F]/', $company)) {
    respond(422, false, 'Название организации должно содержать не более 200 символов и не иметь переносов строк.');
}
if (strlen($email) > 254 || preg_match('/[\r\n]/', $email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, false, 'Укажите корректный email для ответа длиной до 254 символов.');
}
if (textLength($message) < 10 || textLength($message) > 10000 || str_contains($message, "\0")) {
    respond(422, false, 'Добавьте ссылку на закупку или спецификацию: от 10 до 10 000 символов.');
}
if ($values['consent'] !== '1') {
    respond(422, false, 'Подтвердите разрешение использовать email для ответа на ваш запрос.');
}

$now = time();
$attempts = array_values(array_filter(
    is_array($_SESSION['mail_attempts'] ?? null) ? $_SESSION['mail_attempts'] : [],
    static fn ($time): bool => is_int($time) && $time > $now - 900
));
$last = $attempts === [] ? 0 : max($attempts);
if (count($attempts) >= 5 || ($last > 0 && $now - $last < 30)) {
    $wait = count($attempts) >= 5 ? max(1, min($attempts) + 900 - $now) : 30 - ($now - $last);
    header('Retry-After: ' . $wait);
    respond(429, false, 'Слишком частые отправки. Подождите ' . $wait . ' сек. и повторите запрос. Текст сохранён.');
}
// Count failed mail attempts too, and retain the session lock until mail returns.
$attempts[] = $now;
$_SESSION['mail_attempts'] = $attempts;
$body = "Запрос на поставку с simfer.com.ru\n\nОрганизация: " . ($company === '' ? 'не указана' : $company)
    . "\nEmail для ответа: " . $email . "\n\nСпецификация или ссылка на закупку:\n" . $message;
$headers = [
    'From' => 'no-reply@simfer.com.ru',
    'Reply-To' => $email,
    'MIME-Version' => '1.0',
    'Content-Type' => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => 'base64',
];
$subject = '=?UTF-8?B?' . base64_encode('Запрос на поставку с simfer.com.ru') . '?=';
try {
    $sent = function_exists('mail') && @mail(
        'info@simfer.com.ru',
        $subject,
        chunk_split(base64_encode($body), 76, "\r\n"),
        $headers
    );
} catch (Throwable $error) {
    $sent = false;
}
if (!$sent) {
    respond(503, false, 'Сервер не принял письмо к отправке. Данные сохранены в форме. Напишите на info@simfer.com.ru или позвоните +7 (978) 579-29-95.');
}
$values = ['company' => '', 'email' => '', 'message' => '', 'consent' => ''];
respond(200, true, 'Письмо передано почтовому серверу для отправки. Это ещё не подтверждает доставку в почтовый ящик.');
