const fs = require('fs');
const path = require('path');

const map = {
  "placeholder-zinc-600": "placeholder-slate-400",
  "placeholder-zinc-500": "placeholder-slate-400",
  "focus:ring-indigo-500": "focus:ring-blue-500",
  "focus:border-indigo-500": "focus:border-blue-500",
  "shadow-indigo-500": "shadow-blue-500",
  "shadow-indigo-900": "shadow-blue-200",
  "hover:shadow-indigo-500": "hover:shadow-blue-500",
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  for (const [key, value] of Object.entries(map)) {
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

console.log('Cleanup update complete!');
