import fs from 'fs';
const lines = fs.readFileSync('src/components/ProfessionalModule.tsx', 'utf8').split('\n');

const selectStartIndex = lines.findIndex((l, i) => i > 390 && l.includes('<label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Nivel de Interés</label>'));
const selectEndIndex = lines.findIndex((l, i) => i > selectStartIndex && l.includes('</div>'));

if (selectStartIndex >= 0 && selectEndIndex > selectStartIndex) {
  lines.splice(selectStartIndex - 1, selectEndIndex - selectStartIndex + 2,
    '                         <div>',
    '                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#7B8371]">Nivel de Interés</label>',
    '                            <select value={newLead.interest} onChange={e => setNewLead({...newLead, interest: e.target.value})} className="w-full h-10 px-3 py-2 rounded-md bg-white border border-[#E5E2D9] text-sm focus:outline-none focus:ring-2 focus:ring-[#A3B18A]">',
    '                               <option value="Alto">Alto 🔥</option>',
    '                               <option value="Medio">Medio ☀️</option>',
    '                               <option value="Bajo">Bajo ☁️</option>',
    '                            </select>',
    '                         </div>'
  );
  fs.writeFileSync('src/components/ProfessionalModule.tsx', lines.join('\n'));
  console.log('Fixed interest dropdown.');
} else {
  console.log('Could not find interest dropdown bounds.');
}
