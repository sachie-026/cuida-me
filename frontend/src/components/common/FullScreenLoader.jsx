import Logo from "./Logo";

const FullScreenLoader = ({ message = "Carregando..." }) => (
  <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-5">
    <Logo size="lg" />
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      <p className="text-slate-500 text-sm font-medium">{message}</p>
    </div>
  </div>
);

export default FullScreenLoader;