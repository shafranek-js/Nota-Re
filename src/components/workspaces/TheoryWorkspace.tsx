import React from 'react';
import { METHOD_PRINCIPLES, BOOKS_CATALOG } from '../../data/bibliography';

export const TheoryWorkspace: React.FC = () => {
  const principleColorClasses: Record<string, { border: string; text: string }> = {
    emerald: { border: 'border-emerald-500/30', text: 'text-emerald-400' },
    sky: { border: 'border-sky-500/30', text: 'text-sky-400' },
    indigo: { border: 'border-indigo-500/30', text: 'text-indigo-400' },
    amber: { border: 'border-amber-500/30', text: 'text-amber-400' }
  };

  const moduleColorClasses: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    sky: 'text-sky-400',
    rose: 'text-rose-400'
  };

  return (
    <section className="flex-1 min-h-0 w-full p-4 overflow-y-auto custom-scroll">
      {/* 4 Главных принципа методики */}
      <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-3.5 mb-4">
        {METHOD_PRINCIPLES.map(p => {
          const col = principleColorClasses[p.color] || principleColorClasses.emerald;
          return (
            <div key={p.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <div className={`text-xs font-mono mb-1 ${col.text}`}>{p.timecode}</div>
                <h3 className="font-bold text-sm text-white mb-1">{p.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Каталог 60+ пособий и сборников */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
        <h3 className="font-bold text-base text-white mb-3">
          📚 Каталог пособий и сборников системы «НОТА РЕ» по модулям курса
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
          {BOOKS_CATALOG.map((group, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-col">
              <div className={`font-bold mb-2 pb-1.5 border-b border-slate-800/80 ${moduleColorClasses[group.color] || 'text-emerald-400'}`}>
                {group.module}
              </div>
              <ul className="space-y-1.5 text-slate-300">
                {group.books.map((b, bIdx) => (
                  <li key={bIdx} className="leading-relaxed">
                    • <strong>{b.author}</strong> — <em>{b.title}</em>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
