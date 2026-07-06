// A broad list of country names (plus a few common aliases), all lowercase.
// Any label that matches one of these is treated as a "Country" filter;
// everything else is treated as a "Subject". Add aliases freely.

const COUNTRY_NAMES = [
  "afghanistan", "albania", "algeria", "andorra", "angola", "antigua and barbuda",
  "argentina", "armenia", "australia", "austria", "azerbaijan", "bahamas", "bahrain",
  "bangladesh", "barbados", "belarus", "belgium", "belize", "benin", "bhutan",
  "bolivia", "bosnia and herzegovina", "botswana", "brazil", "brunei", "bulgaria",
  "burkina faso", "burundi", "cambodia", "cameroon", "canada", "cape verde",
  "central african republic", "chad", "chile", "china", "colombia", "comoros",
  "congo", "costa rica", "croatia", "cuba", "cyprus", "czech republic", "czechia",
  "denmark", "djibouti", "dominica", "dominican republic", "ecuador", "egypt",
  "el salvador", "equatorial guinea", "eritrea", "estonia", "eswatini", "ethiopia",
  "fiji", "finland", "france", "gabon", "gambia", "georgia", "germany", "ghana",
  "greece", "grenada", "guatemala", "guinea", "guinea-bissau", "guyana", "haiti",
  "honduras", "hungary", "iceland", "india", "indonesia", "iran", "iraq", "ireland",
  "israel", "italy", "ivory coast", "cote d'ivoire", "jamaica", "japan", "jordan",
  "kazakhstan", "kenya", "kiribati", "kosovo", "kuwait", "kyrgyzstan", "laos",
  "latvia", "lebanon", "lesotho", "liberia", "libya", "liechtenstein", "lithuania",
  "luxembourg", "madagascar", "malawi", "malaysia", "maldives", "mali", "malta",
  "marshall islands", "mauritania", "mauritius", "mexico", "micronesia", "moldova",
  "monaco", "mongolia", "montenegro", "morocco", "mozambique", "myanmar", "burma",
  "namibia", "nauru", "nepal", "netherlands", "holland", "new zealand", "nicaragua",
  "niger", "nigeria", "north korea", "north macedonia", "macedonia", "norway", "oman",
  "pakistan", "palau", "palestine", "panama", "papua new guinea", "paraguay", "peru",
  "philippines", "poland", "portugal", "qatar", "romania", "russia", "rwanda",
  "saint kitts and nevis", "saint lucia", "saint vincent and the grenadines", "samoa",
  "san marino", "sao tome and principe", "saudi arabia", "senegal", "serbia",
  "seychelles", "sierra leone", "singapore", "slovakia", "slovenia", "solomon islands",
  "somalia", "south africa", "south korea", "south sudan", "spain", "sri lanka",
  "sudan", "suriname", "sweden", "switzerland", "syria", "taiwan", "tajikistan",
  "tanzania", "thailand", "timor-leste", "east timor", "togo", "tonga",
  "trinidad and tobago", "tunisia", "turkey", "turkiye", "turkmenistan", "tuvalu",
  "uganda", "ukraine", "united arab emirates", "uae", "united kingdom", "uk",
  "england", "scotland", "wales", "united states", "usa", "us", "america", "uruguay",
  "uzbekistan", "vanuatu", "vatican city", "venezuela", "vietnam", "yemen", "zambia",
  "zimbabwe",
]

export const COUNTRY_SET = new Set(COUNTRY_NAMES)

export function isCountryLabel(label: string) {
  return COUNTRY_SET.has(label.trim().toLowerCase())
}
