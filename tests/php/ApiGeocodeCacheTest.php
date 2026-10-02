<?php
declare(strict_types=1);

final class ApiGeocodeCacheTest extends DatabaseTestCase
{
    private function store(array $payload): ApiResponse
    {
        $this->request('POST', $payload);
        return $this->capture(static fn() => handleGeocodeCache());
    }

    private function entries(): array
    {
        $this->request('GET');
        return json_decode(json_encode($this->capture(static fn() => handleGeocodeCache())->payload['entries']), true);
    }

    public function testStoresAndListsHitsAndMisses(): void
    {
        $this->assertSame(204, $this->store(['key' => 'weg 1|13469|berlin', 'result' => ['lon' => 13.34, 'lat' => 52.61, 'quality' => 'genau']])->statusCode);
        $this->store(['key' => 'nirgends 9||', 'result' => null]);

        $this->assertEqualsCanonicalizing([
            'weg 1|13469|berlin' => ['lon' => 13.34, 'lat' => 52.61, 'quality' => 'genau'],
            'nirgends 9||' => null,
        ], $this->entries());
    }

    public function testEmptyCacheIsAnObject(): void
    {
        $this->request('GET');
        $this->assertSame('{}', json_encode($this->capture(static fn() => handleGeocodeCache())->payload['entries']));
    }

    public function testStoringAgainOverwritesTheEntry(): void
    {
        $this->store(['key' => 'a', 'result' => null]);
        $this->store(['key' => 'a', 'result' => ['lon' => 13.3, 'lat' => 52.6, 'quality' => 'strasse']]);

        $this->assertSame(['a' => ['lon' => 13.3, 'lat' => 52.6, 'quality' => 'strasse']], $this->entries());
        $this->assertSame(1, $this->countRows('adress_koordinate'));
    }

    public function testRejectsInvalidInput(): void
    {
        $call = static fn() => handleGeocodeCache();
        $this->request('POST', ['key' => ' ', 'result' => null]);
        $this->assertApiError(400, 'Schluessel', $call);
        $this->request('POST', ['key' => str_repeat('x', 256), 'result' => null]);
        $this->assertApiError(400, 'zu lang', $call);
        $this->request('POST', ['key' => 'a', 'result' => ['lon' => 'x', 'lat' => 1, 'quality' => 'genau']]);
        $this->assertApiError(400, 'Zahlen', $call);
        $this->request('POST', ['key' => 'a', 'result' => ['lon' => 200, 'lat' => 1, 'quality' => 'genau']]);
        $this->assertApiError(400, 'Bereich', $call);
        $this->request('POST', ['key' => 'a', 'result' => ['lon' => 13, 'lat' => 52, 'quality' => 'ungefaehr']]);
        $this->assertApiError(400, 'Genauigkeit', $call);
        $this->request('DELETE');
        $this->assertApiError(405, 'nicht erlaubt', $call);
    }
}
