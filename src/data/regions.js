const RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position";

export const REGIONS = [
  {
    id: "klang-valley",
    name: "Klang Valley",
    lat: 3.139,
    lng: 101.6869,
    zoom: 12,
  },
  { id: "penang", name: "Penang", lat: 5.4164, lng: 100.3327, zoom: 13 },
  { id: "ipoh", name: "Ipoh", lat: 4.5975, lng: 101.0901, zoom: 14 },
  { id: "jb", name: "Johor Bahru", lat: 1.4927, lng: 103.7414, zoom: 13 },
  { id: "kuching", name: "Kuching", lat: 1.5533, lng: 110.3592, zoom: 13 },
];

export const AGENCIES = [
  {
    id: "rapid-bus-kl",
    name: "Rapid Bus KL",
    type: "bus",
    region: "klang-valley",
    url: RT + "/prasarana?category=rapid-bus-kl",
  },
  {
    id: "rapid-bus-mrtfeeder",
    name: "MRT Feeder",
    type: "bus",
    region: "klang-valley",
    url: RT + "/prasarana?category=rapid-bus-mrtfeeder",
  },
  {
    id: "ktmb",
    name: "KTMB Komuter",
    type: "train",
    region: "klang-valley",
    url: RT + "/ktmb",
  },
  {
    id: "rapid-bus-penang",
    name: "Rapid Penang",
    type: "bus",
    region: "penang",
    url: RT + "/prasarana?category=rapid-bus-penang",
  },
  {
    id: "rapid-bus-kuantan",
    name: "Rapid Kuantan",
    type: "bus",
    region: null,
    url: RT + "/prasarana?category=rapid-bus-kuantan",
  },
  {
    id: "mybas-kangar",
    name: "myBAS Kangar",
    type: "bus",
    region: null,
    url: RT + "/mybas-kangar",
  },
  {
    id: "mybas-alor-setar",
    name: "myBAS Alor Setar",
    type: "bus",
    region: null,
    url: RT + "/mybas-alor-setar",
  },
  {
    id: "mybas-kota-bharu",
    name: "myBAS Kota Bharu",
    type: "bus",
    region: null,
    url: RT + "/mybas-kota-bharu",
  },
  {
    id: "mybas-kuala-terengganu",
    name: "myBAS Kuala Terengganu",
    type: "bus",
    region: null,
    url: RT + "/mybas-kuala-terengganu",
  },
  {
    id: "mybas-ipoh",
    name: "myBAS Ipoh",
    type: "bus",
    region: "ipoh",
    url: RT + "/mybas-ipoh",
  },
  {
    id: "mybas-seremban-a",
    name: "myBAS Seremban A",
    type: "bus",
    region: null,
    url: RT + "/mybas-seremban-a",
  },
  {
    id: "mybas-seremban-b",
    name: "myBAS Seremban B",
    type: "bus",
    region: null,
    url: RT + "/mybas-seremban-b",
  },
  {
    id: "mybas-melaka",
    name: "myBAS Melaka",
    type: "bus",
    region: null,
    url: RT + "/mybas-melaka",
  },
  {
    id: "mybas-johor",
    name: "myBAS Johor",
    type: "bus",
    region: "jb",
    url: RT + "/mybas-johor",
  },
  {
    id: "mybas-kuching",
    name: "myBAS Kuching",
    type: "bus",
    region: "kuching",
    url: RT + "/mybas-kuching",
  },
];

export const agencyById = (id) => AGENCIES.find((a) => a.id === id);
export const agenciesForRegion = (rid) =>
  AGENCIES.filter((a) => a.region === rid);
