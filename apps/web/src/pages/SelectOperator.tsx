import { useNavigate } from 'react-router-dom';
import { OPERATORS, useOperatorStore, type Operator } from '@/stores';

/**
 * The front door of the app. No real auth yet (emails/SSO come later) — this
 * is the whole team's shared login sharing one dashboard, so each person
 * just tells it who they are. Full-bleed, no sidebar/topnav chrome; picking
 * a name persists to localStorage and hands off to Home.
 */
export function SelectOperator() {
  const navigate = useNavigate();
  const setOperator = useOperatorStore(s => s.setOperator);

  const pick = (op: Operator) => {
    setOperator(op);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-navy-deep px-6 py-16 relative overflow-hidden">
      {/* ambient glow accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full">
        <span className="text-micro font-bold uppercase tracking-[0.2em] text-cyan-400 mb-3">
          LCX Sales Cockpit
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-ice text-center mb-2">
          Who&rsquo;s behind the wheel?
        </h1>
        <p className="text-label text-ice/50 text-center mb-10">
          Pick your seat — we&rsquo;ll remember you on this browser next time.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 w-full">
          {OPERATORS.map((op, i) => (
            <button
              key={op.id}
              onClick={() => pick(op)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group flex flex-col items-center gap-3 rounded-xl border border-ice/10 bg-ice/[0.03] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-ice/20 hover:bg-ice/[0.06] hover:shadow-lg animate-fadeIn"
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-md transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: op.colorVar }}
              >
                {op.initials}
              </span>
              <span className="text-sm font-semibold text-ice">{op.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-12 text-micro text-ice/30 text-center max-w-sm">
          Personal accounts and single sign-on are coming — for now the whole team shares one login.
        </p>
      </div>
    </div>
  );
}

export default SelectOperator;
