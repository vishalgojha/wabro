const LOCALITY_MAP = [
  // South Mumbai
  { area: "Colaba", zones: ["South Mumbai"], keywords: ["colaba", "cuffe parade", "upper colaba", "lower colaba"] },
  { area: "Fort", zones: ["South Mumbai"], keywords: ["fort", "ballard estate", "d n road"] },
  { area: "Marine Lines", zones: ["South Mumbai"], keywords: ["marine lines", "marine drive", "queens necklace"] },
  { area: "Churchgate", zones: ["South Mumbai"], keywords: ["churchgate", "nariman point"] },
  { area: "Malabar Hill", zones: ["South Mumbai"], keywords: ["malabar hill", "walkeshwar", "banganga"] },
  { area: "Tardeo", zones: ["South Mumbai"], keywords: ["tardeo", "grant road"] },
  { area: "Parel", zones: ["Central Mumbai"], keywords: ["parel", "lalbaug", "lower parel"] },
  { area: "Worli", zones: ["South Mumbai"], keywords: ["worli", "worli sea face", "worli village"] },
  { area: "Prabhadevi", zones: ["Central Mumbai"], keywords: ["prabhadevi", "siddhivinayak"] },
  { area: "Dadar", zones: ["Central Mumbai"], keywords: ["dadar", "dadar west", "dadar east", "plaza"] },
  { area: "Mahalaxmi", zones: ["South Mumbai"], keywords: ["mahalaxmi", "race course"] },
  { area: "Byculla", zones: ["Central Mumbai"], keywords: ["byculla", "mazgaon", "reay road"] },
  { area: "Mahim", zones: ["Central Mumbai"], keywords: ["mahim", "mahim west", "mahim east"] },
  { area: "Matunga", zones: ["Central Mumbai"], keywords: ["matunga", "matunga west", "matunga east", "king's circle"] },
  { area: "Sion", zones: ["Central Mumbai"], keywords: ["sion", "sion west", "sion east", "sion circle"] },
  // Western Suburbs
  { area: "Bandra", zones: ["Western Suburbs"], keywords: ["bandra", "bandra west", "bandra east", "bandra kurla complex", "bkc", "bandstand", "hill road"] },
  { area: "Khar", zones: ["Western Suburbs"], keywords: ["khar", "khar west", "khar east", "khar danda"] },
  { area: "Santacruz", zones: ["Western Suburbs"], keywords: ["santacruz", "santa cruz", "santacruz west", "santacruz east", "vakola"] },
  { area: "Vile Parle", zones: ["Western Suburbs"], keywords: ["vile parle", "vile parle west", "vile parle east", "parle"] },
  { area: "Andheri", zones: ["Western Suburbs"], keywords: ["andheri", "andheri west", "andheri east", "andheri kurla road", "saki naka", "marol", "mIDC", "seepz", "chakala", "dhake colony", "four bungalows", "lokhandwala", "versova"] },
  { area: "Juhu", zones: ["Western Suburbs"], keywords: ["juhu", "juhu beach", "juhu vashi", "juhu gaon", "juhu nagar"] },
  { area: "Versova", zones: ["Western Suburbs"], keywords: ["versova", "yari road", "link road"] },
  { area: "Malad", zones: ["Western Suburbs"], keywords: ["malad", "malad west", "malad east", "marve", "akshay", "kandivali west"] },
  { area: "Goregaon", zones: ["Western Suburbs"], keywords: ["goregaon", "goregaon west", "goregaon east", "film city", "ayappa mandir", "ram mandir road"] },
  { area: "Kandivali", zones: ["Western Suburbs"], keywords: ["kandivali", "kandivali west", "kandivali east", "charkop", "poisar", "samta nagar"] },
  { area: "Borivali", zones: ["Western Suburbs"], keywords: ["borivali", "borivali west", "borivali east", "kandarpada", "mahatma nagar", "ic colony", "dahisar"] },
  { area: "Dahisar", zones: ["Western Suburbs"], keywords: ["dahisar", "dahisar west", "dahisar east", "dahisar link road"] },
  // Eastern Suburbs
  { area: "Kurla", zones: ["Eastern Suburbs"], keywords: ["kurla", "kurla west", "kurla east", "nehru nagar", "shivaji nagar", "vidyavihar"] },
  { area: "Ghatkopar", zones: ["Eastern Suburbs"], keywords: ["ghatkopar", "ghatkopar west", "ghatkopar east", "pant nagar", "tagore nagar", "kastur park", "vikhroli"] },
  { area: "Vikhroli", zones: ["Eastern Suburbs"], keywords: ["vikhroli", "vikhroli west", "vikhroli east", "godrej"] },
  { area: "Bhandup", zones: ["Eastern Suburbs"], keywords: ["bhandup", "bhandup west", "bhandup east", "kanjurmarg"] },
  { area: "Kanjurmarg", zones: ["Eastern Suburbs"], keywords: ["kanjurmarg", "kanjur", "safed pool"] },
  { area: "Mulund", zones: ["Eastern Suburbs"], keywords: ["mulund", "mulund west", "mulund east", "mulund colony", "nehru road"] },
  { area: "Nahur", zones: ["Eastern Suburbs"], keywords: ["nahur", "nahur west", "nahur east"] },
  // Navi Mumbai
  { area: "Vashi", zones: ["Navi Mumbai"], keywords: ["vashi", "vashi sector", "apmc", "vashi village"] },
  { area: "Nerul", zones: ["Navi Mumbai"], keywords: ["nerul", "nerul west", "nerul east", "sector 1 nerul"] },
  { area: "CBD Belapur", zones: ["Navi Mumbai"], keywords: ["belapur", "cbd belapur", "belapur cbd"] },
  { area: "Kharghar", zones: ["Navi Mumbai"], keywords: ["kharghar", "kharghar sector", "central park"] },
  { area: "Panvel", zones: ["Navi Mumbai"], keywords: ["panvel", "panvel west", "panvel east", "old panvel", "new panvel", "kalamboli", "mohpada", "khopoli"] },
  { area: "Kamothe", zones: ["Navi Mumbai"], keywords: ["kamothe", "kamothe sector"] },
  { area: "New Panvel", zones: ["Navi Mumbai"], keywords: ["new panvel", "panvel cbd"] },
  { area: "Uran", zones: ["Navi Mumbai"], keywords: ["uran", "nhava sheva", "jawaharlal nehru port", "sheva"] },
  // Thane
  { area: "Thane West", zones: ["Thane"], keywords: ["thane west", "naupada", "ghodbunder", "kasarvadavali", "waghbil", "manpada", "brahmand", "hiranandani thane", "vasant vihar", "panchpakhadi", "pokhran"] },
  { area: "Thane East", zones: ["Thane"], keywords: ["thane east", "mumbra", "dokhle", "kalwa", "majiwada", "kolshet", "balkum", "shil phata"] },
  { area: "Dombivli", zones: ["Thane"], keywords: ["dombivli", "dombivli west", "dombivli east", "nilaje", "phadke road"] },
  { area: "Kalyan", zones: ["Thane"], keywords: ["kalyan", "kalyan west", "kalyan east", "ambarnath", "ulhasnagar", "shahad", "badlapur", "titwala"] },
  { area: "Bhiwandi", zones: ["Thane"], keywords: ["bhiwandi", "bhiwandi west", "bhiwandi east", "padgha"] },
  { area: "Mira Road", zones: ["Thane"], keywords: ["mira road", "mira bhayandar", "bhayander", "bhayandar", "miraroad"] },
  // Pune
  { area: "Hinjewadi", zones: ["Pune"], keywords: ["hinjewadi", "phase 1 hinjewadi", "phase 2 hinjewadi", "phase 3 hinjewadi"] },
  { area: "Wakad", zones: ["Pune"], keywords: ["wakad", "shivaji chowk wakad"] },
  { area: "Baner", zones: ["Pune"], keywords: ["baner", "baner road", "baner pashan link road"] },
  { area: "Kharadi", zones: ["Pune"], keywords: ["kharadi", "kharadi bypass", "kharadi pune"] },
  { area: "Viman Nagar", zones: ["Pune"], keywords: ["viman nagar", "viman"] },
  { area: "Koregaon Park", zones: ["Pune"], keywords: ["koregaon park", "koregaon"] },
  { area: "Kalyani Nagar", zones: ["Pune"], keywords: ["kalyani nagar", "kalyani"] },
  { area: "Magarpatta", zones: ["Pune"], keywords: ["magarpatta", "magarpatte", "magarpatta city"] },
  { area: "Hadapsar", zones: ["Pune"], keywords: ["hadapsar", "hadapsar pune", "saswad road"] },
  { area: "Pimple Saudagar", zones: ["Pune"], keywords: ["pimple saudagar", "pimple", "pimple gurav", "pimple nilakh"] },
  { area: "Aundh", zones: ["Pune"], keywords: ["aundh", "aundh pune"] },
  { area: "Bibvewadi", zones: ["Pune"], keywords: ["bibvewadi", "bibwewadi"] },
  { area: "Swargate", zones: ["Pune"], keywords: ["swargate", "swargate pune"] },
  { area: "Camp", zones: ["Pune"], keywords: ["pune camp", "campionn"] },
  // Bangalore
  { area: "Whitefield", zones: ["Bangalore"], keywords: ["whitefield", "white field", "hoodi", "kadugodi", "pattandur agrahara"] },
  { area: "Electronic City", zones: ["Bangalore"], keywords: ["electronic city", "electronics city", "phase 1 electronic city"] },
  { area: "HSR Layout", zones: ["Bangalore"], keywords: ["hsr layout", "hsr"] },
  { area: "Koramangala", zones: ["Bangalore"], keywords: ["koramangala", "koramangala 1st block", "koramangala 2nd block"] },
  { area: "Indiranagar", zones: ["Bangalore"], keywords: ["indiranagar", "indiara nagar", "indira nagar"] },
  { area: "MG Road", zones: ["Bangalore"], keywords: ["mg road", "mahatma gandhi road"] },
  { area: "Brigade Road", zones: ["Bangalore"], keywords: ["brigade road", "brigade"] },
  { area: "JP Nagar", zones: ["Bangalore"], keywords: ["jp nagar", "jayaprakash nagar"] },
  { area: "BTM Layout", zones: ["Bangalore"], keywords: ["btm layout", "btm"] },
  { area: "Marathahalli", zones: ["Bangalore"], keywords: ["marathahalli", "maratahalli"] },
  { area: "Jayanagar", zones: ["Bangalore"], keywords: ["jayanagar", "jaya nagar", "jayanagar 4th block"] },
  { area: "Yelahanka", zones: ["Bangalore"], keywords: ["yelahanka", "yelahanka new town", "yelahanka satelite"] },
  { area: "Hebbal", zones: ["Bangalore"], keywords: ["hebbal", "hebbal bangalore"] },
  { area: "Malleshwaram", zones: ["Bangalore"], keywords: ["malleshwaram", "malleswaram"] },
  { area: "Rajajinagar", zones: ["Bangalore"], keywords: ["rajajinagar", "raja ji nagar"] },
  // Delhi NCR
  { area: "Dwarka", zones: ["Delhi"], keywords: ["dwarka", "dwarka sector", "dwarka delhi"] },
  { area: "Rohini", zones: ["Delhi"], keywords: ["rohini", "rohini sector", "rohini delhi"] },
  { area: "Pitampura", zones: ["Delhi"], keywords: ["pitampura", "pitam pura"] },
  { area: "Janakpuri", zones: ["Delhi"], keywords: ["janakpuri", "janak puri", "janakpuri west"] },
  { area: "Connaught Place", zones: ["Delhi"], keywords: ["connaught place", "cp", "rajiv chowk"] },
  { area: "Lajpat Nagar", zones: ["Delhi"], keywords: ["lajpat nagar", "lajpat"] },
  { area: "Saket", zones: ["Delhi"], keywords: ["saket", "saket delhi"] },
  { area: "Hauz Khas", zones: ["Delhi"], keywords: ["hauz khas", "hauz"] },
  { area: "Greater Noida", zones: ["Noida"], keywords: ["greater noida", "greater noida west", "greater noida sector"] },
  { area: "Noida", zones: ["Noida"], keywords: ["noida", "noida sector", "sector 62 noida", "sector 63 noida"] },
  { area: "Gurgaon", zones: ["Gurgaon"], keywords: ["gurgaon", "gurugram", "dlf phase", "sector 56 gurgaon", "sector 57 gurgaon"] },
  { area: "Ghaziabad", zones: ["Delhi NCR"], keywords: ["ghaziabad", "vaishali", "vasundhara", "indirapuram"] },
  { area: "Faridabad", zones: ["Delhi NCR"], keywords: ["faridabad", "sector 21 faridabad"] },
  // Ahmedabad
  { area: "SG Highway", zones: ["Ahmedabad"], keywords: ["sg highway", "sg road", "s g highway"] },
  { area: "CG Road", zones: ["Ahmedabad"], keywords: ["cg road", "chimanbhai goyal road"] },
  { area: "Satellite", zones: ["Ahmedabad"], keywords: ["satellite", "satellite ahmedabad"] },
  { area: "Bopal", zones: ["Ahmedabad"], keywords: ["bopal", "bopal ahmedabad"] },
  { area: "Maninagar", zones: ["Ahmedabad"], keywords: ["maninagar", "mani nagar"] },
  // Chennai
  { area: "OMR", zones: ["Chennai"], keywords: ["omr", "old mahabalipuram road", "navalur", "sholinganallur", "thalambur", "siruseri"] },
  { area: "Velachery", zones: ["Chennai"], keywords: ["velachery", "velacheri"] },
  { area: "Tambaram", zones: ["Chennai"], keywords: ["tambaram", "tambaram west", "tambaram east"] },
  { area: "Guindy", zones: ["Chennai"], keywords: ["guindy", "guindy chennai"] },
  { area: "Adyar", zones: ["Chennai"], keywords: ["adyar", "adyar chennai"] },
  { area: "Anna Nagar", zones: ["Chennai"], keywords: ["anna nagar", "anna nagar west", "anna nagar east"] },
  { area: "T Nagar", zones: ["Chennai"], keywords: ["t nagar", "thyagaraya nagar"] },
  // Hyderabad
  { area: "HITEC City", zones: ["Hyderabad"], keywords: ["hitech city", "hitec city", "madapur", "gachibowli"] },
  { area: "Kondapur", zones: ["Hyderabad"], keywords: ["kondapur", "kondapur hyderabad"] },
  { area: "Kukatpally", zones: ["Hyderabad"], keywords: ["kukatpally", "kukatpalli"] },
  { area: "Jubilee Hills", zones: ["Hyderabad"], keywords: ["jubilee hills", "jubilee"] },
  { area: "Banjara Hills", zones: ["Hyderabad"], keywords: ["banjara hills", "banjara"] },
  { area: "Gachibowli", zones: ["Hyderabad"], keywords: ["gachibowli", "gachi bowli"] },
  { area: "Sikandrabad", zones: ["Hyderabad"], keywords: ["sikandrabad", "secunderabad"] },
  // Kolkata
  { area: "Salt Lake", zones: ["Kolkata"], keywords: ["salt lake", "sector v", "bidhannagar"] },
  { area: "New Town", zones: ["Kolkata"], keywords: ["new town", "newtown", "new town kolkata", "action area"] },
  { area: "Rajarhat", zones: ["Kolkata"], keywords: ["rajarhat", "rajarhat kolkata"] },
  { area: "Ballygunge", zones: ["Kolkata"], keywords: ["ballygunge", "ballygunj"] },
  { area: "South City", zones: ["Kolkata"], keywords: ["south city", "south city kolkata"] },
  // Other major cities
  { area: "Jaipur", zones: ["Jaipur"], keywords: ["jaipur", "malviya nagar jaipur", "tonk road", "vaishali nagar"] },
  { area: "Lucknow", zones: ["Lucknow"], keywords: ["lucknow", "gomti nagar", "hazratganj", "aliganj"] },
  { area: "Chandigarh", zones: ["Chandigarh"], keywords: ["chandigarh", "mohali", "panchkula", "tricity"] },
  { area: "Indore", zones: ["Indore"], keywords: ["indore", "vijay nagar", "scheme 54"] },
  { area: "Surat", zones: ["Surat"], keywords: ["surat", "vesu", "piplod", "adajan", "city light"] },
  { area: "Kochi", zones: ["Kochi"], keywords: ["kochi", "cochin", "ernakulam", "marine drive kochi", "kakkanad"] },
  { area: "Goa", zones: ["Goa"], keywords: ["goa", "panjim", "panaji", "margao", "calangute", "porvorim"] },
];

export function matchArea(groupSubject) {
  if (!groupSubject) return null;
  const lower = groupSubject.toLowerCase();

  for (const entry of LOCALITY_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return { area: entry.area, zones: entry.zones };
      }
    }
  }

  // check city-level matches
  const cityMap = [
    ["mumbai", "Mumbai", ["Mumbai"]],
    ["bombay", "Mumbai", ["Mumbai"]],
    ["pune", "Pune", ["Pune"]],
    ["bangalore", "Bangalore", ["Bangalore"]],
    ["bengaluru", "Bangalore", ["Bangalore"]],
    ["delhi", "Delhi", ["Delhi"]],
    ["new delhi", "Delhi", ["Delhi"]],
    ["ahmedabad", "Ahmedabad", ["Ahmedabad"]],
    ["chennai", "Chennai", ["Chennai"]],
    ["madras", "Chennai", ["Chennai"]],
    ["hyderabad", "Hyderabad", ["Hyderabad"]],
    ["kolkata", "Kolkata", ["Kolkata"]],
    ["calcutta", "Kolkata", ["Kolkata"]],
    ["jaipur", "Jaipur", ["Jaipur"]],
    ["lucknow", "Lucknow", ["Lucknow"]],
    ["chandigarh", "Chandigarh", ["Chandigarh"]],
    ["indore", "Indore", ["Indore"]],
    ["surat", "Surat", ["Surat"]],
    ["kochi", "Kochi", ["Kochi"]],
    ["thane", "Thane", ["Thane"]],
    ["navi mumbai", "Navi Mumbai", ["Navi Mumbai"]],
  ];

  for (const [keyword, area, zones] of cityMap) {
    if (lower.includes(keyword)) {
      return { area, zones };
    }
  }

  return null;
}

export function getGroupAreas(groupSubject) {
  if (!groupSubject) return [];
  const match = matchArea(groupSubject);
  return match ? [{ area: match.area, zone: match.zones[0] || match.area }] : [];
}
