import fs from 'fs';
let c = fs.readFileSync('src/components/ProfessionalModule.tsx', 'utf8');
c = c.replace('className="w-7 h-7 bg-[#A3B18A]/10 text-[#A3B18A] hover:bg-[#A3B18A] hover:text-white rounded-md shrink-0"', 'className="w-7 h-7 bg-[#A3B18A]/10 text-[#A3B18A] hover:bg-[#A3B18A] hover:text-white rounded-md shrink-0 ml-auto"');
fs.writeFileSync('src/components/ProfessionalModule.tsx', c);
console.log('done');
