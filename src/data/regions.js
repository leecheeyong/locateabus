const RT = 'https://api.data.gov.my/gtfs-realtime/vehicle-position'

export const REGION = { id: 'klang-valley', name: 'Klang Valley', lat: 3.139, lng: 101.6869, zoom: 12 }

export const AGENCIES = [
  { id: 'rapid-bus-kl', name: 'Rapid Bus KL', type: 'bus', region: 'klang-valley', url: RT + '/prasarana?category=rapid-bus-kl' },
  { id: 'rapid-bus-mrtfeeder', name: 'MRT Feeder', type: 'bus', region: 'klang-valley', url: RT + '/prasarana?category=rapid-bus-mrtfeeder' },
  { id: 'ktmb', name: 'KTMB Komuter', type: 'train', region: 'klang-valley', url: RT + '/ktmb' },
]

export const agenciesForRegion = (rid) => AGENCIES.filter((a) => a.region === rid)
