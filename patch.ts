import fs from 'fs';

const lines = fs.readFileSync('src/components/ProfessionalModule.tsx', 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.includes('{lead.phone && ('));
const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('</a>'));

if (startIndex >= 0 && endIndex > startIndex) {
  lines.splice(startIndex, endIndex - startIndex + 2, 
    '                              {lead.phone && (',
    '                                 <div className="flex items-center gap-1">',
    '                                    <a',
    '                                       href={`https://api.whatsapp.com/send/?phone=${lead.phone.replace(/\\\\D/g, \'\')}&text=Hola%20${encodeURIComponent(lead.name.split(\' \')[0])},`}',
    '                                       target="_blank"',
    '                                       rel="noopener noreferrer"',
    '                                       onClick={(e) => { e.stopPropagation(); handleAddHistory(lead, \'whatsapp\', \'Botón directo WhatsApp usado\'); }}',
    '                                       className="text-[10px] text-[#25D366] hover:bg-[#25D366]/10 font-bold border border-[#25D366]/30 px-1.5 py-0.5 rounded flex items-center transition-colors"',
    '                                       title="WhatsApp"',
    '                                    >',
    '                                       <MessageCircle className="w-3 h-3" />',
    '                                    </a>',
    '                                    <a',
    '                                       href={`tel:${lead.phone.replace(/\\\\D/g, \'\')}`}',
    '                                       onClick={(e) => { e.stopPropagation(); handleAddHistory(lead, \'call\', \'Llamada rápida iniciada\'); }}',
    '                                       className="text-[10px] text-blue-500 hover:bg-blue-50 font-bold border border-blue-200 px-1.5 py-0.5 rounded flex items-center transition-colors"',
    '                                       title="Llamar"',
    '                                    >',
    '                                       <Phone className="w-3 h-3" />',
    '                                    </a>',
    '                                 </div>',
    '                              )}'
  );
}

const dateStartIndex = lines.findIndex(l => l.includes('{lead.nextActionDate > 0 && ('));
const dateEndIndex = lines.findIndex((l, i) => i > dateStartIndex && l.includes(')}'));

if (dateStartIndex >= 0) {
  lines.splice(dateStartIndex, dateEndIndex - dateStartIndex + 1,
    '                              {lead.nextActionDate > 0 && (() => {',
    '                                 const actionDate = new Date(lead.nextActionDate);',
    '                                 const today = new Date();',
    '                                 today.setHours(0,0,0,0);',
    '                                 const actionDateMidnight = new Date(actionDate);',
    '                                 actionDateMidnight.setHours(0,0,0,0);',
    '                                 const diffDays = Math.round((actionDateMidnight.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));',
    '                                 let colorClass = "text-[#A3B18A] bg-[#A3B18A]/10 border border-[#A3B18A]/20";',
    '                                 let text = actionDate.toLocaleDateString(\'es-ES\');',
    '                                 if (diffDays < 0) {',
    '                                    colorClass = "text-red-500 bg-red-50 border border-red-200";',
    '                                    text = `Atrasado (${text})`;',
    '                                 } else if (diffDays === 0) {',
    '                                    colorClass = "text-amber-600 bg-amber-50 border border-amber-200";',
    '                                    text = "Hoy";',
    '                                 } else if (diffDays === 1) {',
    '                                    colorClass = "text-blue-500 bg-blue-50 border border-blue-200";',
    '                                    text = "Mañana";',
    '                                 }',
    '                                 return (',
    '                                    <div className={`text-[9px] font-bold tracking-widest uppercase flex items-center self-start px-1.5 py-0.5 rounded ${colorClass}`}>',
    '                                      <Calendar className="w-2.5 h-2.5 mr-1" /> {text}',
    '                                    </div>',
    '                                 );',
    '                              })()}'
  );
}

const selectStartIndex = lines.findIndex(l => l.includes('<select '));
const selectEndIndex = lines.findIndex((l, i) => i > selectStartIndex && l.includes('</select>'));

if (selectStartIndex >= 0) {
  lines.splice(selectStartIndex, selectEndIndex - selectStartIndex + 1,
    '                                <select ',
    '                                   value={lead.stage} ',
    '                                   onChange={(e) => handleUpdateStage(lead, e.target.value)}',
    '                                   className="col-span-2 text-[10px] px-0.5 py-1 rounded-md bg-[#F9F8F4] border border-[#E5E2D9] text-[#7B8371] font-bold uppercase tracking-wider focus:outline-none focus:ring-1 focus:ring-[#A3B18A] max-w-[80px] overflow-hidden truncate"',
    '                                   onClick={(e) => e.stopPropagation()}',
    '                                >',
    '                                  {STAGES.map((s, idx) => <option key={s} value={s}>{idx+1}. {s}</option>)}',
    '                                </select>',
    '                                {STAGES.indexOf(lead.stage) < STAGES.length - 1 && (',
    '                                  <Button ',
    '                                     size="icon" ',
    '                                     disabled={STAGES.indexOf(lead.stage) >= STAGES.length - 1}',
    '                                     onClick={(e) => { ',
    '                                        e.stopPropagation(); ',
    '                                        const nextIdx = STAGES.indexOf(lead.stage) + 1;',
    '                                        if (nextIdx < STAGES.length) {',
    '                                           handleUpdateStage(lead, STAGES[nextIdx]);',
    '                                        }',
    '                                     }}',
    '                                     className="w-7 h-7 bg-white border border-[#E5E2D9] text-[#7B8371] hover:bg-[#A3B18A] hover:text-white hover:border-[#A3B18A] rounded-md shrink-0"',
    '                                     title="Avanzar etapa"',
    '                                  >',
    '                                    <ArrowRight className="w-3 h-3" />',
    '                                  </Button>',
    '                                )}'
  );
}

fs.writeFileSync('src/components/ProfessionalModule.tsx', lines.join('\n'));
