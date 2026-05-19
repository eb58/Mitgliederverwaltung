# Datenbankschema

Das Liquibase-ChangeLog `changelog/db.changelog-master.sql` legt ein MySQL-Schema fuer die aktuellen Mitgliedsdaten an.

```powershell
liquibase --url="jdbc:mysql://localhost:3306/mitgliederverwaltung?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&serverTimezone=Europe/Berlin" --username=<user> --password=<passwort> update --changelog-file=db/changelog/db.changelog-master.sql
```

Die Tabelle `mitglied` enthaelt die einfachen Felder aus `app.js`. Mehrfachauswahlen liegen in `mitglied_interessengruppe` und `mitglied_funktion`. Passbilder werden in `mitglied_passbild` als `MEDIUMBLOB` mit Dateiname, MIME-Type, Groesse und optionalem SHA-256 gespeichert. Das alte Textfeld `passbild` bleibt in `mitglied` erhalten, damit vorhandene Pfade oder Dateinamen beim Import nicht verloren gehen.

## Datenimport

Aus einer vorhandenen `members.json` kann ein separates Liquibase-Daten-ChangeLog erzeugt werden. Der Generator sucht Passbilder automatisch im Ordner `Passbilder` neben der JSON-Datei.

```powershell
node scripts/create-mysql-data-changelog.js C:\Pfad\zur\members.json db\changelog\data\members.mysql.sql
liquibase --url="jdbc:mysql://localhost:3306/mitgliederverwaltung?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&serverTimezone=Europe/Berlin" --username=<user> --password=<passwort> update --changelog-file=db/changelog/data/members.mysql.sql
```

`createDatabaseIfNotExist=true` legt die Datenbank automatisch an, wenn der MySQL-Benutzer die Berechtigung `CREATE` hat. Falls `wp_user` diese Berechtigung nicht global hat, muss die Datenbank einmalig mit dem Root-Benutzer angelegt oder dem Benutzer die Berechtigung gegeben werden.
