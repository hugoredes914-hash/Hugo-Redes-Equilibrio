import fs from 'fs';
const lines = fs.readFileSync('src/components/ProfessionalModule.tsx', 'utf8').split('\n');

lines.splice(532, 31,
    '                              {lead.phone && (',
    '                                 <div className="flex items-center gap-1">',
    '                                    <a ',
    '                                       href={`https://api.whatsapp.com/send/?phone=${lead.phone.replace(/\\\\D/g, \'\')}&text=Hola%20${encodeURIComponent(lead.name.split(\' \')[0])},`}',
    '                                       target="_blank"',
    '                                       rel="noopener noreferrer"',
    '                                       onClick={(e) => { e.stopPropagation(); handleAddHistory(lead, \'whatsapp\', \'Botón directo WhatsApp usado\'); }}',
    '                                       className="text-[10px] text-[#25D366] hover:bg-[#25D366]/10 font-bold border border-[#25D366]/30 px-1.5 py-0.5 rounded flex items-center transition-colors"',
    '                                       title="WhatsApp"',
    '                                    >',
    '                                       <MessageCircle className="w-3 h-3" />',
    '                                    </a>',
    '                                    <a ',
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

fs.writeFileSync('src/components/ProfessionalModule.tsx', lines.join('\n'));
