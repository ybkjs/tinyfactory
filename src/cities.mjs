// Cities for the weather/sun picker. Pick one in the UI, or set "city" in the config ("beijing" or { name, lat, lon }).
export const CITIES = [
  { id: "beijing", zh: "北京", en: "Beijing", lat: 39.904, lon: 116.407, tz: "Asia/Shanghai" },
  { id: "shanghai", zh: "上海", en: "Shanghai", lat: 31.23, lon: 121.474, tz: "Asia/Shanghai" },
  { id: "shenzhen", zh: "深圳", en: "Shenzhen", lat: 22.543, lon: 114.058, tz: "Asia/Shanghai" },
  { id: "guangzhou", zh: "广州", en: "Guangzhou", lat: 23.129, lon: 113.264, tz: "Asia/Shanghai" },
  { id: "hangzhou", zh: "杭州", en: "Hangzhou", lat: 30.274, lon: 120.155, tz: "Asia/Shanghai" },
  { id: "nanjing", zh: "南京", en: "Nanjing", lat: 32.06, lon: 118.797, tz: "Asia/Shanghai" },
  { id: "chengdu", zh: "成都", en: "Chengdu", lat: 30.573, lon: 104.066, tz: "Asia/Shanghai" },
  { id: "wuhan", zh: "武汉", en: "Wuhan", lat: 30.593, lon: 114.305, tz: "Asia/Shanghai" },
  { id: "xian", zh: "西安", en: "Xi'an", lat: 34.341, lon: 108.94, tz: "Asia/Shanghai" },
  { id: "hongkong", zh: "香港", en: "Hong Kong", lat: 22.319, lon: 114.169, tz: "Asia/Hong_Kong" },
  { id: "taipei", zh: "台北", en: "Taipei", lat: 25.033, lon: 121.565, tz: "Asia/Taipei" },
  { id: "tokyo", zh: "东京", en: "Tokyo", lat: 35.676, lon: 139.65, tz: "Asia/Tokyo" },
  { id: "seoul", zh: "首尔", en: "Seoul", lat: 37.566, lon: 126.978, tz: "Asia/Seoul" },
  { id: "singapore", zh: "新加坡", en: "Singapore", lat: 1.352, lon: 103.82, tz: "Asia/Singapore" },
  { id: "london", zh: "伦敦", en: "London", lat: 51.507, lon: -0.128, tz: "Europe/London" },
  { id: "berlin", zh: "柏林", en: "Berlin", lat: 52.52, lon: 13.405, tz: "Europe/Berlin" },
  { id: "paris", zh: "巴黎", en: "Paris", lat: 48.857, lon: 2.352, tz: "Europe/Paris" },
  { id: "newyork", zh: "纽约", en: "New York", lat: 40.713, lon: -74.006, tz: "America/New_York" },
  { id: "sf", zh: "旧金山", en: "San Francisco", lat: 37.775, lon: -122.419, tz: "America/Los_Angeles" },
  { id: "seattle", zh: "西雅图", en: "Seattle", lat: 47.606, lon: -122.332, tz: "America/Los_Angeles" },
  { id: "toronto", zh: "多伦多", en: "Toronto", lat: 43.653, lon: -79.383, tz: "America/Toronto" },
  { id: "sydney", zh: "悉尼", en: "Sydney", lat: -33.869, lon: 151.209, tz: "Australia/Sydney" }
];

// Default city: the first one in the machine's time zone, else Beijing
export function defaultCity(tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return CITIES.find((c) => c.tz === tz) || CITIES[0];
}

export function resolveCity(value) {
  if (!value) return defaultCity();
  if (typeof value === "object" && Number.isFinite(value.lat)) return { id: "custom", zh: value.name, en: value.name, ...value };
  const key = String(value).toLowerCase().replace(/[\s'-]/g, "");
  return CITIES.find((c) => c.id === key || c.zh === value || c.en.toLowerCase().replace(/[\s'-]/g, "") === key) || defaultCity();
}
