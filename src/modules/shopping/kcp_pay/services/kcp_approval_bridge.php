<?php
// KCP 서버 브리지 (Node -> PHP CLI -> KCP)
// stdin JSON 입력으로 approve/cancel 액션 수행 후 JSON 반환

declare(strict_types=1);

function out_json(array $payload): void
{
    $encoded = json_encode(
        sanitize_for_json($payload),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    if ($encoded === false || $encoded === null || $encoded === '') {
        $encoded = '{"success":false,"res_cd":"9099","res_msg":"JSON_ENCODE_FAILED"}';
    }
    echo $encoded;
    exit;
}

function sanitize_for_json($value)
{
    if (is_array($value)) {
        $next = [];
        foreach ($value as $k => $v) {
            $next[$k] = sanitize_for_json($v);
        }
        return $next;
    }

    if (!is_string($value)) return $value;
    return to_utf8_safe($value);
}

function to_utf8_safe(string $value): string
{
    if ($value === '') return $value;
    if (preg_match('//u', $value)) return $value;

    if (function_exists('iconv')) {
        $converted = @iconv('CP949', 'UTF-8//IGNORE', $value);
        if ($converted !== false && $converted !== '') return $converted;
        $converted = @iconv('EUC-KR', 'UTF-8//IGNORE', $value);
        if ($converted !== false && $converted !== '') return $converted;
    }

    return preg_replace('/[^\x20-\x7E]/', '', $value) ?? '';
}

function env_str(string $name, string $default = ''): string
{
    $v = getenv($name);
    if ($v === false) return $default;
    return trim((string)$v);
}

function get_res(C_PP_CLI_T $cPayPlus, string $name): string
{
    return (string)$cPayPlus->mf_get_res_data($name);
}

function normalize_mod_desc(string $raw): string
{
    $value = trim($raw);
    if ($value === '') return 'AUTO_CANCEL';
    $value = preg_replace('/[\r\n\t]+/', ' ', $value);
    if ($value === null) return 'AUTO_CANCEL';
    return mb_substr($value, 0, 120);
}

$input = stream_get_contents(STDIN);
$data = json_decode((string)$input, true);
if (!is_array($data)) {
    out_json([
        'success' => false,
        'res_cd' => '9001',
        'res_msg' => '브리지 입력(JSON) 파싱 실패',
    ]);
}

$homeDir = env_str('KCP_PAY_HOME_DIR', 'C:/xampp/htdocs/bomiora/www/shop/kcp');
$siteCd = env_str('KCP_PAY_SITE_CD', '');
$siteKey = env_str('KCP_PAY_SITE_KEY', '');
$gwUrl = env_str('KCP_PAY_GW_URL', (stripos($siteCd, 'T000') === 0 ? 'testpaygw.kcp.co.kr' : 'paygw.kcp.co.kr'));
$gwPort = env_str('KCP_PAY_GW_PORT', '8090');
$keyDir = env_str('KCP_PAY_KEY_DIR', $homeDir . '/bin/pub.key');
$logDir = env_str('KCP_PAY_LOG_DIR', $homeDir . '/log');
$logLevel = env_str('KCP_PAY_LOG_LEVEL', '3');

if ($siteCd === '' || $siteKey === '') {
    out_json([
        'success' => false,
        'res_cd' => '9002',
        'res_msg' => 'KCP_PAY_SITE_CD 또는 KCP_PAY_SITE_KEY 설정 누락',
    ]);
}

$libPath = $homeDir . '/pp_ax_hub_lib.php';
if (!file_exists($libPath)) {
    out_json([
        'success' => false,
        'res_cd' => '9003',
        'res_msg' => 'pp_ax_hub_lib.php 파일을 찾을 수 없습니다.',
        'lib_path' => $libPath,
    ]);
}

require_once $libPath;

$action = isset($data['action']) ? strtolower(trim((string)$data['action'])) : 'approve';
$ordrIdxx = isset($data['ordr_idxx']) ? trim((string)$data['ordr_idxx']) : '';
$custIp = isset($data['cust_ip']) ? trim((string)$data['cust_ip']) : '127.0.0.1';

register_shutdown_function(function () {
    $last = error_get_last();
    if (!is_array($last)) return;
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array($last['type'] ?? 0, $fatalTypes, true)) return;
    out_json([
        'success' => false,
        'res_cd' => '9098',
        'res_msg' => 'PHP_BRIDGE_FATAL',
        'fatal' => [
            'type' => $last['type'] ?? null,
            'message' => (string)($last['message'] ?? ''),
            'file' => (string)($last['file'] ?? ''),
            'line' => (int)($last['line'] ?? 0),
        ],
    ]);
});

$cPayPlus = new C_PP_CLI_T();
$cPayPlus->mf_clear();

if ($action === 'cancel') {
    $tno = isset($data['tno']) ? trim((string)$data['tno']) : '';
    $modType = isset($data['mod_type']) ? trim((string)$data['mod_type']) : 'STSC';
    $modDesc = normalize_mod_desc((string)($data['mod_desc'] ?? 'AUTO_CANCEL'));
    $tranCd = '00200000';

    if ($tno === '') {
        out_json([
            'success' => false,
            'res_cd' => '9005',
            'res_msg' => '자동취소 필수 파라미터 누락(tno)',
        ]);
    }

    $cPayPlus->mf_set_modx_data('tno', $tno);
    $cPayPlus->mf_set_modx_data('mod_type', $modType);
    $cPayPlus->mf_set_modx_data('mod_ip', $custIp);
    $cPayPlus->mf_set_modx_data('mod_desc', $modDesc);

    $traceNo = $tno;
    $cPayPlus->mf_do_tx(
        $traceNo,
        $homeDir,
        $siteCd,
        $siteKey,
        $tranCd,
        '',
        $gwUrl,
        $gwPort,
        'payplus_cli_slib',
        $ordrIdxx,
        $custIp,
        $logLevel,
        0,
        0,
        $keyDir,
        $logDir
    );

    $resCd = (string)$cPayPlus->m_res_cd;
    $resMsg = (string)$cPayPlus->m_res_msg;
    out_json([
        'success' => $resCd === '0000',
        'action' => 'cancel',
        'res_cd' => $resCd,
        'res_msg' => $resMsg,
        'tno' => $tno,
        'mod_type' => $modType,
        'mod_desc' => $modDesc,
    ]);
}

// 기본 액션: approve
$reqTx = isset($data['req_tx']) ? trim((string)$data['req_tx']) : 'pay';
$tranCd = isset($data['tran_cd']) ? trim((string)$data['tran_cd']) : '';
$goodMny = isset($data['good_mny']) ? (string)(int)$data['good_mny'] : '0';
$encData = isset($data['enc_data']) ? (string)$data['enc_data'] : '';
$encInfo = isset($data['enc_info']) ? (string)$data['enc_info'] : '';

if ($reqTx !== 'pay' || $tranCd === '' || $ordrIdxx === '' || $encData === '' || $encInfo === '') {
    out_json([
        'success' => false,
        'res_cd' => '9004',
        'res_msg' => '승인 필수 파라미터 누락',
        'required' => ['req_tx=pay', 'tran_cd', 'ordr_idxx', 'enc_data', 'enc_info'],
    ]);
}

$cPayPlus->mf_set_ordr_data('ordr_mony', $goodMny);
$cPayPlus->mf_set_encx_data($encData, $encInfo);

$traceNo = '';
$cPayPlus->mf_do_tx(
    $traceNo,
    $homeDir,
    $siteCd,
    $siteKey,
    $tranCd,
    '',
    $gwUrl,
    $gwPort,
    'payplus_cli_slib',
    $ordrIdxx,
    $custIp,
    $logLevel,
    0,
    0,
    $keyDir,
    $logDir
);

$resCd = (string)$cPayPlus->m_res_cd;
$resMsg = (string)$cPayPlus->m_res_msg;

out_json([
    'success' => $resCd === '0000',
    'action' => 'approve',
    'res_cd' => $resCd,
    'res_msg' => $resMsg,
    'tno' => get_res($cPayPlus, 'tno'),
    'amount' => get_res($cPayPlus, 'amount'),
    'use_pay_method' => get_res($cPayPlus, 'use_pay_method'),
    'pay_method' => get_res($cPayPlus, 'pay_method'),
    'escw_yn' => get_res($cPayPlus, 'escw_yn'),
    'app_no' => get_res($cPayPlus, 'app_no'),
    'app_time' => get_res($cPayPlus, 'app_time'),
    'card_name' => get_res($cPayPlus, 'card_name'),
    'bank_name' => get_res($cPayPlus, 'bank_name'),
    'bank_code' => get_res($cPayPlus, 'bank_code'),
    'bankname' => get_res($cPayPlus, 'bankname'),
    'depositor' => get_res($cPayPlus, 'depositor'),
    'account' => get_res($cPayPlus, 'account'),
    'va_date' => get_res($cPayPlus, 'va_date'),
    'card_other_pay_type' => get_res($cPayPlus, 'card_other_pay_type'),
    'bill_url' => get_res($cPayPlus, 'bill_url'),
]);

