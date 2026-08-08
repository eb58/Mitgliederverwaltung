<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class HandlerLogicTest extends TestCase
{
    /** Prueft Statuscode und Meldung einer erwarteten ApiError. */
    private function assertApiError(int $status, string $messagePart, callable $call): void
    {
        try {
            $call();
        } catch (ApiError $error) {
            $this->assertSame($status, $error->statusCode);
            $this->assertStringContainsString($messagePart, $error->getMessage());
            return;
        }
        $this->fail('Erwartete ApiError wurde nicht geworfen.');
    }

    public function testAssertMethodAllowedPassesForListedMethod(): void
    {
        assertMethodAllowed('POST', ['GET', 'POST']);
        $this->addToAssertionCount(1);
    }

    public function testAssertMethodAllowedRejectsOtherMethodsWith405(): void
    {
        $this->assertApiError(405, 'Methode nicht erlaubt', static fn() => assertMethodAllowed('DELETE', ['GET', 'POST']));
    }

    public function testAssertMethodAllowedIsCaseSensitive(): void
    {
        $this->assertApiError(405, 'Methode nicht erlaubt', static fn() => assertMethodAllowed('get', ['GET']));
    }

    public function testRequireAdminAllowsAdminOnly(): void
    {
        requireAdmin(['role' => 'admin']);
        $this->addToAssertionCount(1);
        $this->assertApiError(403, 'Administratorrechte', static fn() => requireAdmin(['role' => 'user']));
        $this->assertApiError(403, 'Administratorrechte', static fn() => requireAdmin([]));
    }

    public function testAssertUserStaysUsableBlocksSelfDeactivation(): void
    {
        $currentUser = ['id' => 7];
        $this->assertApiError(400, 'nicht deaktiviert', static fn() => assertUserStaysUsable($currentUser, 7, 'admin', false));
    }

    public function testAssertUserStaysUsableBlocksSelfDemotion(): void
    {
        $currentUser = ['id' => 7];
        $this->assertApiError(400, 'muss Admin bleiben', static fn() => assertUserStaysUsable($currentUser, 7, 'user', true));
    }

    public function testAssertUserStaysUsableAllowsChangesToOtherUsers(): void
    {
        assertUserStaysUsable(['id' => 7], 8, 'user', false);
        assertUserStaysUsable(['id' => 7], 7, 'admin', true);
        $this->addToAssertionCount(2);
    }

    public function testDecodeJsonBodyAcceptsEmptyBodyAndObject(): void
    {
        $this->assertSame([], decodeJsonBody(''));
        $this->assertSame(['name' => 'Müller'], decodeJsonBody('{"name":"Müller"}'));
    }

    public function testDecodeJsonBodyRejectsMalformedAndScalarJson(): void
    {
        $this->assertApiError(400, 'Ungueltiger JSON-Body', static fn() => decodeJsonBody('{kaputt'));
        $this->assertApiError(400, 'Ungueltiger JSON-Body', static fn() => decodeJsonBody('42'));
        $this->assertApiError(400, 'Ungueltiger JSON-Body', static fn() => decodeJsonBody('null'));
    }

    public function testClampListLimitUsesDefaultAndBounds(): void
    {
        $this->assertSame(50, clampListLimit(null, 50, 500));
        $this->assertSame(10, clampListLimit('10', 50, 500));
        $this->assertSame(500, clampListLimit(9999, 50, 500));
        $this->assertSame(1, clampListLimit(0, 50, 500));
        $this->assertSame(1, clampListLimit(-5, 50, 500));
        $this->assertSame(1, clampListLimit('abc', 50, 500));
    }

    public function testBuildMemberSearchFilterIsEmptyWithoutSearchTerm(): void
    {
        $this->assertSame(['where' => '', 'params' => []], buildMemberSearchFilter(''));
        $this->assertSame(['where' => '', 'params' => []], buildMemberSearchFilter('   '));
        $this->assertSame(['where' => '', 'params' => []], buildMemberSearchFilter(null));
    }

    public function testBuildMemberSearchFilterWrapsTermForAllColumns(): void
    {
        $filter = buildMemberSearchFilter('  Müller ');
        $this->assertStringContainsString('m.name LIKE ?', $filter['where']);
        $this->assertSame(5, substr_count($filter['where'], '?'));
        $this->assertSame(array_fill(0, 5, '%Müller%'), $filter['params']);
    }

    public function testParseReferenceItemPayloadAcceptsLabelOrName(): void
    {
        $this->assertSame(['id' => 4, 'label' => 'Computer'], parseReferenceItemPayload(['id' => 4, 'label' => ' Computer ']));
        $this->assertSame(['id' => 4, 'label' => 'Computer'], parseReferenceItemPayload(['id' => '4', 'name' => 'Computer']));
    }

    public function testParseReferenceItemPayloadRequiresIdAndLabel(): void
    {
        $this->assertApiError(400, 'ID und Bezeichnung', static fn() => parseReferenceItemPayload(['id' => 0, 'label' => 'Computer']));
        $this->assertApiError(400, 'ID und Bezeichnung', static fn() => parseReferenceItemPayload(['id' => 4, 'label' => '  ']));
        $this->assertApiError(400, 'ID und Bezeichnung', static fn() => parseReferenceItemPayload([]));
    }

    public function testParseReferenceLabelTrimsAndRequiresValue(): void
    {
        $this->assertSame('Excel', parseReferenceLabel(['label' => ' Excel ']));
        $this->assertSame('Excel', parseReferenceLabel(['name' => 'Excel']));
        $this->assertApiError(400, 'Bezeichnung ist erforderlich', static fn() => parseReferenceLabel(['label' => ' ']));
    }

    public function testParsePhotoJsonPayloadDecodesBase64AndFallsBackToDefaults(): void
    {
        $payload = parsePhotoJsonPayload(['base64' => base64_encode('bilddaten')]);
        $this->assertSame('bilddaten', $payload['content']);
        $this->assertSame('passbild.jpg', $payload['fileName']);
        $this->assertSame('image/jpeg', $payload['mimeType']);
    }

    public function testParsePhotoJsonPayloadRejectsMissingOrInvalidBase64(): void
    {
        $this->assertApiError(400, 'base64 ist erforderlich', static fn() => parsePhotoJsonPayload([]));
        $this->assertApiError(400, 'base64 ist erforderlich', static fn() => parsePhotoJsonPayload(['base64' => '@@@']));
    }

    public function testAssertPhotoSizeAllowsExactlyFiveMegabytes(): void
    {
        assertPhotoSize(str_repeat('a', MAX_PHOTO_BYTES));
        $this->addToAssertionCount(1);
        $this->assertApiError(400, 'maximal 5 MB', static fn() => assertPhotoSize(str_repeat('a', MAX_PHOTO_BYTES + 1)));
    }

    public function testBearerTokenReadsAuthorizationHeaderCaseInsensitively(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'bearer   abc.def';
        $this->assertSame('abc.def', bearerToken());
        unset($_SERVER['HTTP_AUTHORIZATION']);
    }

    public function testBearerTokenFallsBackToRedirectHeader(): void
    {
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] = 'Bearer xyz';
        $this->assertSame('xyz', bearerToken());
        unset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }

    public function testBearerTokenIsEmptyWithoutOrWithForeignScheme(): void
    {
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        $this->assertSame('', bearerToken());

        $_SERVER['HTTP_AUTHORIZATION'] = 'Basic abc';
        $this->assertSame('', bearerToken());
        unset($_SERVER['HTTP_AUTHORIZATION']);
    }

    public function testPublicUserCastsTypesAndDropsPasswordHash(): void
    {
        $user = publicUser(['id' => '3', 'username' => 'anna', 'role' => 'user', 'active' => '1', 'password_hash' => 'geheim']);
        $this->assertSame(['id' => 3, 'username' => 'anna', 'role' => 'user', 'active' => true], $user);
        $this->assertArrayNotHasKey('password_hash', $user);
    }

    public function testReferenceDefinitionResolvesKnownTypes(): void
    {
        $this->assertSame('interessengruppe', referenceDefinition('interest-groups')['table']);
        $this->assertSame('name', referenceDefinition('senior-clubs')['column']);
        $this->assertApiError(404, 'Unbekannte Stammdatenart', static fn() => referenceDefinition('gibt-es-nicht'));
    }

    public function testRowToMemberMapsColumnsToApiShape(): void
    {
        $member = rowToMember([
            'id' => '12',
            'name' => 'Müller',
            'vorname' => 'Anna',
            'geschlecht' => 'w',
            'geburtstag' => '1960-02-03 00:00:00',
            'austrittsdatum' => null,
            'austrittsgrund_id' => null,
            'clubzugehoerigkeit_id' => '9',
            'ausweis_erteilt' => '1',
            'beitrag_club_bezahlt' => '0',
            'gezahlter_betrag_club' => '30.50',
            'bemerkung' => null,
            'interessengruppen' => '4,16',
            'funktionen' => '',
            'has_passbild_in_db' => '1',
        ]);

        $this->assertSame(12.0, $member['id']);
        $this->assertSame('Müller', $member['name']);
        $this->assertSame('1960-02-03', $member['geburtstag']);
        $this->assertNull($member['austrittsdatum']);
        $this->assertNull($member['austrittsgrund']);
        $this->assertSame(9.0, $member['clubzugehoerigkeit']);
        $this->assertTrue($member['ausweisErteilt']);
        $this->assertFalse($member['beitragClubBezahlt']);
        $this->assertSame(30.5, $member['gezahlterBetragClub']);
        $this->assertSame('', $member['bemerkung']);
        $this->assertSame([4, 16], $member['interessengruppen']);
        $this->assertSame([], $member['funktionen']);
        $this->assertTrue($member['hasPassbildInDb']);
    }

    public function testRowToMemberFillsEveryKnownFieldEvenForEmptyRow(): void
    {
        $member = rowToMember([]);
        foreach (array_keys(memberFields()) as $jsonKey) {
            $this->assertArrayHasKey($jsonKey, $member);
        }
        $this->assertFalse($member['hasPassbildInDb']);
        $this->assertSame([], $member['interessengruppen']);
    }

    public function testMemberChangeRowToApiBuildsNameAndDecodesJson(): void
    {
        $change = memberChangeRowToApi([
            'id' => '5',
            'mitglied_id' => '12',
            'vorname' => 'Anna',
            'name' => 'Müller',
            'mitglied_existiert' => '12',
            'aktion' => 'updated',
            'geaendert_am' => '2026-08-08 10:00:00',
            'geaendert_von_user_id' => '3',
            'geaendert_von_name' => 'admin',
            'aenderungen_json' => '[{"field":"ort","label":"Ort","old":"Berlin","new":"Potsdam"}]',
        ]);

        $this->assertSame(5, $change['id']);
        $this->assertSame(12, $change['memberId']);
        $this->assertSame('Anna Müller', $change['memberName']);
        $this->assertTrue($change['memberExists']);
        $this->assertSame(3, $change['changedByUserId']);
        $this->assertSame('Potsdam', $change['changes'][0]['new']);
    }

    public function testMemberChangeRowToApiHandlesDeletedMemberAndBrokenJson(): void
    {
        $change = memberChangeRowToApi([
            'id' => 6,
            'mitglied_id' => 99,
            'vorname' => null,
            'name' => null,
            'mitglied_existiert' => null,
            'aktion' => 'deleted',
            'geaendert_am' => '2026-08-08 10:00:00',
            'geaendert_von_user_id' => null,
            'geaendert_von_name' => 'admin',
            'aenderungen_json' => 'kein json',
        ]);

        $this->assertFalse($change['memberExists']);
        $this->assertSame('', $change['memberName']);
        $this->assertNull($change['changedByUserId']);
        $this->assertSame([], $change['changes']);
    }

    public function testFieldGroupsOnlyContainKnownMemberFields(): void
    {
        $known = array_keys(memberFields());
        foreach ([...booleanFields(), ...dateFields(), ...numberFields()] as $field) {
            $this->assertContains($field, $known, "Feld {$field} fehlt in memberFields()");
        }
    }

    public function testEveryAuditedFieldHasALabel(): void
    {
        $labels = memberAuditLabels();
        $audited = array_diff([...array_keys(memberFields()), 'interessengruppen', 'funktionen'], ['id', 'funktion', 'passbild']);
        foreach ($audited as $field) {
            $this->assertArrayHasKey($field, $labels, "Label fuer {$field} fehlt");
        }
    }
}
