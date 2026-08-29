-- Sis-job database schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Camrynn',
  location TEXT NOT NULL DEFAULT 'Albuquerque, NM',
  radius_miles INTEGER NOT NULL DEFAULT 15,
  exclude_keywords TEXT NOT NULL,   -- JSON array of strings
  cash_handling_keywords TEXT NOT NULL, -- JSON array of strings
  boost_keywords TEXT NOT NULL,     -- JSON array of strings
  simple_task_keywords TEXT NOT NULL, -- JSON array of strings
  caution_keywords TEXT NOT NULL,   -- JSON array of strings
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general', -- animal | government | warehouse | retail | general
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT DEFAULT 'application/octet-stream',
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  description TEXT,
  url TEXT NOT NULL,
  salary_min REAL,
  salary_max REAL,
  score INTEGER NOT NULL DEFAULT 0,
  excluded INTEGER NOT NULL DEFAULT 0, -- 0/1
  flags TEXT NOT NULL DEFAULT '[]',    -- JSON array e.g. ["cash_handling","blacklist:gas station"]
  suggested_resume_id INTEGER,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, external_id),
  FOREIGN KEY(suggested_resume_id) REFERENCES resumes(id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | applied | interview | offer | rejected
  resume_id INTEGER,
  notes TEXT DEFAULT '',
  applied_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(job_id) REFERENCES jobs(id),
  FOREIGN KEY(resume_id) REFERENCES resumes(id)
);

INSERT OR IGNORE INTO profile
  (id, name, location, radius_miles, exclude_keywords, cash_handling_keywords, boost_keywords, simple_task_keywords, caution_keywords, notes)
VALUES (
  1,
  'Camrynn',
  'Albuquerque, NM',
  15,
  '["mcdonald","burger king","wendy''s","taco bell","kfc","popeyes","sonic drive","chick-fil-a","pizza hut","domino''s","subway","dairy queen","arby''s","jack in the box","carl''s jr","hardee''s","whataburger","chevron","shell gas","valero","circle k","7-eleven","conoco","phillips 66","speedway","gas station","fuel station","convenience store","truck stop","landfill","waste management","garbage collector","sanitation worker","recycling sorter","junkyard"]',
  '["cash register","handle cash","cash handling","point of sale","pos system","till","cashier","money order","bank teller","make change","counting money","deposit reconciliation","handles transactions","processing transactions","payment transactions"]',
  '["animal","pet ","dog ","cat ","vet ","veterinary","kennel","shelter","zoo","wildlife","child","kids","kid-friendly","daycare","day care","preschool","youth program","camp counselor","nanny","tutor","children''s","recreation assistant","activities assistant","activity assistant","senior affairs","community service"]',
  '["assistant","aide","technician","kennel tech","stock associate","stocker","custodian","housekeeping","groundskeeper","laundry attendant","library page","warehouse sorter","packer","receiving clerk","warehouse associate","shipping associate","receiving associate","fulfillment associate","inventory associate","dispatcher"]',
  '["manager","supervisor","commission","quota","sales target","licensed required","cdl required","accounting","bookkeeping","financial","underwriting","advanced excel","technical support","troubleshooting","data analysis","data analyst"]',
  'No cash/money handling. Keep tasks simple and routine. Prefers animals or kids as a focus, but open to anything appropriate (community service, warehouse/stocking, retail non-cashier, general customer support). No fast food, gas stations, or similar high-turnover manual labor. Also avoid: advanced Excel/admin work, technical troubleshooting support, sales quotas/commission, bookkeeping/accounting, data analysis.'
);
