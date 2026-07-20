const fs = require('fs');
const path = require('path');

const map = {
  // Backgrounds
  "bg-zinc-950": "bg-slate-50",
  "bg-zinc-900": "bg-white",
  "bg-zinc-800": "bg-slate-100",
  "bg-zinc-700": "bg-slate-200",
  "bg-zinc-600": "bg-slate-300",
  
  // Texts
  "text-zinc-100": "text-slate-800",
  "text-zinc-200": "text-slate-700",
  "text-zinc-300": "text-slate-600",
  "text-zinc-400": "text-slate-500",
  "text-zinc-500": "text-slate-500",
  "text-zinc-600": "text-slate-400",
  
  // Borders
  "border-zinc-800": "border-slate-200",
  "border-zinc-700": "border-slate-300",
  "border-zinc-600": "border-slate-300",
  
  // Accents
  "from-indigo-400": "from-blue-500",
  "to-cyan-400": "to-teal-400",
  "from-blue-400": "from-blue-500",
  "via-purple-400": "via-teal-400",
  "to-pink-400": "to-emerald-400",
  "from-indigo-600": "from-blue-600",
  "to-purple-600": "to-emerald-500",
  "from-indigo-500": "from-blue-500",
  "to-purple-500": "to-emerald-400",
  
  "indigo-900": "blue-200",
  "indigo-600": "blue-600",
  "indigo-500": "blue-500",
  "indigo-400": "blue-600",
  "indigo-300": "blue-500",
  
  "emerald-400": "emerald-600",
  "emerald-500": "emerald-500",
  
  "shadow-[0_0_50px_rgba(99,102,241,0.15)]": "shadow-[0_0_50px_rgba(59,130,246,0.15)]", // blue-500
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace each key
  for (const [key, value] of Object.entries(map)) {
    // using regex to ensure we match whole words for classes
    // e.g. /bg-zinc-950(?![a-zA-Z0-9_-])/g
    const regex = new RegExp(`(?<![a-zA-Z0-9_-])${key}(?![a-zA-Z0-9_-])`, 'g');
    content = content.replace(regex, value);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walk(path.join(__dirname, 'app'));
walk(path.join(__dirname, 'src', 'components'));

console.log('Theme update complete!');
