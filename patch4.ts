import fs from 'fs';
let content = fs.readFileSync('src/components/ProfessionalModule.tsx', 'utf8');

content = content.replace('<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">', '<div className="flex flex-col gap-6">');
content = content.replace('<section className="xl:col-span-2 bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">', '<section className="bg-white rounded-3xl p-6 md:p-8 flex flex-col border border-[#E5E2D9] shadow-sm">');
content = content.replace('<section className="bg-white rounded-3xl p-6 flex flex-col border border-[#E5E2D9] shadow-sm self-start sticky top-6">', '<section className="bg-white rounded-3xl p-6 flex flex-col border border-[#E5E2D9] shadow-sm">');

fs.writeFileSync('src/components/ProfessionalModule.tsx', content);
console.log('patched');
