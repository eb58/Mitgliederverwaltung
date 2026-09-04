<?php
declare(strict_types=1);

return [
    'db' => [
        'host' => 'mysql.example.com',
        'port' => 3306,
        'name' => 'mitgliederverwaltung',
        'user' => 'db_user',
        'password' => 'db_passwort',
    ],
    // Nur noetig, wenn das Frontend unter einer anderen Origin laeuft als die API.
    // Leer lassen heisst: gleiche Origin - der Normalfall bei diesem Deployment.
    'cors_origin' => '',
];
