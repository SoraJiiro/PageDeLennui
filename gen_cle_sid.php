<?php

function generateSecretKey($l = 26) {
    $bytes = random_bytes($l);
    $cle = substr(str_replace(['+', '/', '='], '', base64_encode($bytes)), 0, $l);
    
    return $cle;
}

echo generateSecretKey() . PHP_EOL;