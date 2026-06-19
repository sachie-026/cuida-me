import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "../components/common/Logo";

const Terms = () => (
  <div className="min-h-screen bg-slate-50">
    <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between">
      <Link to="/"><Logo size="sm" /></Link>
    </nav>
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
        <ArrowLeft size={15} /> Voltar ao início
      </Link>
      <h1 className="font-display text-3xl font-bold text-navy mb-2">Termos de Uso</h1>
      <p className="text-slate-500 text-sm mb-8">Última atualização: Junho de 2026</p>

      <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">1. Aceitação dos Termos</h2>
          <p>Ao utilizar a plataforma Cuida.me, você concorda com estes Termos de Uso. Se não concordar, não utilize nossos serviços.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">2. Sobre a Plataforma</h2>
          <p>A Cuida.me é uma plataforma de marketplace que conecta famílias e pacientes a profissionais de saúde domiciliar verificados. Não somos empregadores dos profissionais cadastrados.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">3. Cadastro e Responsabilidades</h2>
          <p>Você é responsável pela veracidade das informações fornecidas no cadastro. O uso indevido da plataforma pode resultar no cancelamento da conta.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">4. Verificação de Profissionais</h2>
          <p>Todos os profissionais passam por processo de verificação de documentos e aprovação pela nossa equipe antes de aparecerem para clientes. Ainda assim, recomendamos que os usuários façam suas próprias avaliações.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">5. Pagamentos e Comissão</h2>
          <p>A Cuida.me cobra uma comissão de 12% sobre o valor de cada atendimento para manutenção da plataforma. Os pagamentos são processados de forma segura.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">6. Cancelamentos</h2>
          <p>Cancelamentos devem ser realizados com pelo menos 2 horas de antecedência. Cancelamentos fora do prazo podem estar sujeitos a cobrança.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">7. Contato</h2>
          <p>Dúvidas: <a href="mailto:suporte@cuida.me" className="text-blue-500 hover:underline">suporte@cuida.me</a></p>
        </section>
      </div>
    </div>
  </div>
);

export default Terms;