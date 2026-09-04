<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class LibTest extends TestCase
{
    public function testNormalizeUserRoleDefaultsToAdmin(): void
    {
        $this->assertSame('user', normalizeUserRole(null));
        $this->assertSame('user', normalizeUserRole(''));
        $this->assertSame('user', normalizeUserRole('user'));
        $this->assertSame('admin', normalizeUserRole('admin'));
        $this->assertSame('admin', normalizeUserRole(null, 'admin'));
    }

    public function testNormalizeUserRoleRejectsUnknownRole(): void
    {
        $this->expectException(ApiError::class);
        normalizeUserRole('superadmin');
    }

    public function testIsPasswordUnsetTreatsWhitespaceAsUnset(): void
    {
        $this->assertTrue(isPasswordUnset(''));
        $this->assertTrue(isPasswordUnset('   '));
        $this->assertFalse(isPasswordUnset('$2y$10$abc'));
    }

    public function testValuesMatchIgnoringCaseIsCaseAndUmlautAware(): void
    {
        $this->assertTrue(valuesMatchIgnoringCase('Admin', 'admin'));
        $this->assertTrue(valuesMatchIgnoringCase('MÜLLER', 'müller'));
        $this->assertFalse(valuesMatchIgnoringCase('admin', 'user'));
    }

    public function testStringCaseVariantsIncludesUniqueMbVariants(): void
    {
        $variants = stringCaseVariants('Müller');
        $this->assertContains('Müller', $variants);
        $this->assertContains('müller', $variants);
        $this->assertContains('MÜLLER', $variants);
        $this->assertSame(array_values(array_unique($variants)), $variants);
    }

    public function testIsPasswordChangeRequiredForUserWhenHashUnset(): void
    {
        $user = ['username' => 'admin', 'password_hash' => ''];
        $this->assertTrue(isPasswordChangeRequiredForUser($user));
    }

    public function testIsPasswordChangeRequiredForUserComparesGivenPasswordCaseInsensitively(): void
    {
        $user = ['username' => 'admin', 'password_hash' => password_hash('irrelevant', PASSWORD_DEFAULT)];
        $this->assertTrue(isPasswordChangeRequiredForUser($user, 'ADMIN'));
        $this->assertFalse(isPasswordChangeRequiredForUser($user, 'othersecret'));
    }

    public function testIsPasswordChangeRequiredForUserDetectsUsernameAsStoredPassword(): void
    {
        $user = ['username' => 'admin', 'password_hash' => password_hash('admin', PASSWORD_DEFAULT)];
        $this->assertTrue(isPasswordChangeRequiredForUser($user));

        $user['password_hash'] = password_hash('geheim123', PASSWORD_DEFAULT);
        $this->assertFalse(isPasswordChangeRequiredForUser($user));
    }

    public function testBase64UrlEncodeProducesUrlSafeTokenWithoutPadding(): void
    {
        $encoded = base64UrlEncode(random_bytes(32));
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', $encoded);
        $this->assertStringNotContainsString('=', $encoded);
    }

    public function testTokenHashIsDeterministicSha256(): void
    {
        $hash = tokenHash('mein-token');
        $this->assertSame(hash('sha256', 'mein-token'), $hash);
        $this->assertSame(64, strlen($hash));
    }

    public function testRequestPathPrefersPathInfo(): void
    {
        $_SERVER['PATH_INFO'] = '/api/members';
        $this->assertSame('/api/members', requestPath());
        unset($_SERVER['PATH_INFO']);
    }

    public function testRequestPathStripsScriptNameFromRequestUri(): void
    {
        $_SERVER['SCRIPT_NAME'] = '/mitgliederverwaltung/php-api/index.php';
        $_SERVER['REQUEST_URI'] = '/mitgliederverwaltung/php-api/index.php/api/members?limit=10';
        $this->assertSame('/api/members', requestPath());
        unset($_SERVER['SCRIPT_NAME'], $_SERVER['REQUEST_URI']);
    }

    public function testNormalizeIdsDedupesAndDropsNonPositiveValues(): void
    {
        $this->assertSame([3, 5], normalizeIds([3, 3, '5', -1, 0, 'abc']));
        $this->assertSame([], normalizeIds('not-an-array'));
    }

    public function testNormalizeFunctionIdsParsesSemicolonSeparatedList(): void
    {
        $this->assertSame([1, 2], normalizeFunctionIds('1; 2 ;abc;0;-3'));
        $this->assertSame([], normalizeFunctionIds(''));
    }

    public function testNormalizeMemberInputCoercesFieldTypes(): void
    {
        $member = normalizeMemberInput([
            'name' => 'Müller',
            'vorname' => 'Anna',
            'auswahl' => true,
            'ausweisErteilt' => 0,
            'geburtstag' => '1960-02-03T00:00:00',
            'austrittsgrund' => '',
            'clubzugehoerigkeit' => '9',
            'gezahlterBetragClub' => '30.5',
            'interessengruppen' => [16, 16, '4'],
            'funktion' => '1;3',
        ]);

        $this->assertSame('Müller', $member['name']);
        $this->assertSame(1, $member['auswahl']);
        $this->assertSame(0, $member['ausweisErteilt']);
        $this->assertSame('1960-02-03', $member['geburtstag']);
        $this->assertNull($member['austrittsgrund']);
        $this->assertEqualsWithDelta(9.0, $member['clubzugehoerigkeit'], 0.0001);
        $this->assertEqualsWithDelta(30.5, $member['gezahlterBetragClub'], 0.0001);
        $this->assertSame([16, 4], $member['interessengruppen']);
        $this->assertSame([1, 3], $member['funktionen']);
    }

    public function testNormalizeMemberInputPartialOnlyKeepsProvidedFields(): void
    {
        $this->assertSame(['name' => 'Foo'], normalizeMemberInput(['name' => 'Foo'], true));
    }

    public function testAssertKnownFieldsRejectsUnknownKeys(): void
    {
        $this->expectException(ApiError::class);
        assertKnownFields(['name' => 'Foo', 'unbekanntesFeld' => 'x']);
    }

    public function testAssertKnownFieldsAcceptsKnownKeys(): void
    {
        assertKnownFields(['name' => 'Foo', 'interessengruppen' => [], 'funktionen' => []]);
        $this->addToAssertionCount(1);
    }

    public function testAssertValidMemberRequiresNameAndVorname(): void
    {
        $this->expectException(ApiError::class);
        assertValidMember(['name' => '', 'vorname' => 'Anna', 'geschlecht' => 'w']);
    }

    public function testAssertValidMemberRequiresKnownGeschlecht(): void
    {
        $this->expectException(ApiError::class);
        assertValidMember(['name' => 'Müller', 'vorname' => 'Anna', 'geschlecht' => 'x']);
    }

    public function testAssertValidMemberAcceptsValidMember(): void
    {
        assertValidMember(['name' => 'Müller', 'vorname' => 'Anna', 'geschlecht' => 'w']);
        $this->addToAssertionCount(1);
    }

    public function testFormatReferenceValueLooksUpMapOrFallsBackToId(): void
    {
        $map = [8 => 'Gäste', 9 => 'Lübars'];
        $this->assertSame('Lübars', formatReferenceValue(9, $map));
        $this->assertSame('', formatReferenceValue(0, $map));
        $this->assertSame('42', formatReferenceValue(42, $map));
    }

    public function testFormatReferenceListValueJoinsLabels(): void
    {
        $map = [4 => 'Computer', 16 => 'Excel'];
        $this->assertSame('Excel, Computer', formatReferenceListValue([16, 4], $map));
        $this->assertSame('', formatReferenceListValue([], $map));
    }

    public function testFormatAuditValueFormatsKnownFieldTypes(): void
    {
        $this->assertSame('Ja', formatAuditValue('ausweisErteilt', true));
        $this->assertSame('Nein', formatAuditValue('ausweisErteilt', false));
        $this->assertSame('maennlich', formatAuditValue('geschlecht', 'm'));
        $this->assertSame('weiblich', formatAuditValue('geschlecht', 'w'));
        $this->assertSame('Ja + Gast', formatAuditValue('weihnachtsessen', 2));
        $this->assertSame('Hallo', formatAuditValue('bemerkung', 'Hallo'));
        $this->assertSame('', formatAuditValue('bemerkung', null));
        $this->assertSame('', formatAuditValue('bemerkung', ''));
    }

    public function testNormalizedAuditValueSortsArraysAndCoercesTypes(): void
    {
        $this->assertSame([1, 2, 3], normalizedAuditValue('interessengruppen', [3, '1', 2]));
        $this->assertTrue(normalizedAuditValue('ausweisErteilt', 1));
        $this->assertFalse(normalizedAuditValue('ausweisErteilt', 0));
        $this->assertNull(normalizedAuditValue('austrittsgrund', '0'));
        $this->assertSame(5, normalizedAuditValue('austrittsgrund', '5'));
        $this->assertEqualsWithDelta(12.5, normalizedAuditValue('gezahlterBetragClub', '12.50'), 0.0001);
        $this->assertSame('', normalizedAuditValue('bemerkung', null));
    }

    public function testBuildMemberAuditChangesDetectsOnlyChangedFields(): void
    {
        $before = ['name' => 'Alt', 'weihnachtsessen' => 0];
        $after = ['name' => 'Neu', 'weihnachtsessen' => 1];

        $changes = buildMemberAuditChanges($before, $after);
        $byField = array_column($changes, null, 'field');

        $this->assertCount(2, $changes);
        $this->assertSame(['old' => 'Alt', 'new' => 'Neu'], ['old' => $byField['name']['old'], 'new' => $byField['name']['new']]);
        $this->assertSame(['old' => 'Nein', 'new' => 'Ja'], ['old' => $byField['weihnachtsessen']['old'], 'new' => $byField['weihnachtsessen']['new']]);
    }
}
