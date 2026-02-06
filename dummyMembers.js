const generateDummyData = () => {
    const members = [];
    const firstNames = ['Max', 'Anna', 'Peter', 'Maria', 'Thomas', 'Julia', 'Michael', 'Sarah', 'Daniel', 'Laura'];
    const lastNames = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann'];
    const cities = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt'];
    const categories = [
        {name: 'Vollmitglied', fee: 60, weight: 50},
        {name: 'Jugend', fee: 30, weight: 25},
        {name: 'Familie', fee: 100, weight: 20},
        {name: 'Ehrenmitglied', fee: 0, weight: 5}
    ];

    for (let i = 1; i <= 200; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

        let selectedCategory = categories[0];
        const rand = Math.random() * 100;
        let cum = 0;
        for (let c of categories) {
            cum += c.weight;
            if (rand < cum) {
                selectedCategory = c;
                break;
            }
        }

        const paymentRand = Math.random();
        const paymentStatus = paymentRand < 0.8 ? 'bezahlt' : paymentRand < 0.95 ? 'ausstehend' : 'überfällig';

        const yearJoined = 2015 + Math.floor(Math.random() * 12);
        const monthJoined = Math.floor(Math.random() * 12);
        const dayJoined = Math.floor(Math.random() * 28) + 1;
        const joinDate = new Date(yearJoined, monthJoined, dayJoined);

        const age = 55 + Math.floor(Math.random() * 30);
        const birthYear = new Date().getFullYear() - age;
        const birthdate = new Date(birthYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);

        members.push({
            id: i,
            memberNumber: String(i).padStart(4, '0'),
            firstName, lastName,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@email.de`,
            phone: '0123 456789',
            street: 'Teststraße 1', zip: '12345', city: cities[Math.floor(Math.random() * cities.length)],
            birthdate: birthdate.toISOString().split('T')[0],
            joinDate: joinDate.toISOString().split('T')[0],
            category: selectedCategory.name,
            annualFee: selectedCategory.fee,
            status: Math.random() > 0.1 ? 'aktiv' : 'inaktiv',
            paymentStatus,
            paymentDate: paymentStatus === 'bezahlt' ? '2025-01-15' : '',
            notes: ''
        });
    }
    return members;
};
