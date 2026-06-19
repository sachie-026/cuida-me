import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "../components/common/Logo";

const Privacy = () => (
  <div className="min-h-screen bg-slate-50">
    <nav className="bg-white border-b border-slate-100 px-4 sm:px-6 h-16 flex items-center justify-between">
      <Link to="/"><Logo size="sm" /></Link>
    </nav>
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link to="/" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-500 mb-6 transition-colors">
        <ArrowLeft size={15} /> Voltar ao início
      </Link>
      <h1 className="font-display text-3xl font-bold text-navy mb-2">Política de Privacidade</h1>
      <p className="text-slate-500 text-sm mb-8">Última atualização: Junho de 2026</p>

      <div className="space-y-6 text-slate-600 text-sm leading-relaxed">
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">1. Dados que Coletamos</h2>
          <p>Coletamos nome completo, CPF, e-mail, telefone, endereço e informações de saúde do paciente (diagnósticos, medicamentos, alergias) necessários para a prestação do serviço.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">2. Como Usamos seus Dados</h2>
          <p>Seus dados são usados exclusivamente para: conectar você a profissionais de saúde, processar agendamentos e pagamentos, e melhorar a plataforma. Não vendemos seus dados a terceiros.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">3. Compartilhamento de Dados</h2>
          <p>Compartilhamos apenas as informações necessárias com o profissional que você contratar (nome do paciente, condições de saúde relevantes e endereço de atendimento).</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">4. Segurança</h2>
          <p>Utilizamos criptografia e boas práticas de segurança para proteger seus dados. Senhas nunca são armazenadas em texto simples.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">5. LGPD — Lei Geral de Proteção de Dados</h2>
          <p>Em conformidade com a LGPD (Lei 13.709/2018), você tem direito a acessar, corrigir ou solicitar a exclusão dos seus dados a qualquer momento. Entre em contato: <a href="mailto:privacidade@cuida.me" className="text-blue-500 hover:underline">privacidade@cuida.me</a></p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">6. Cookies</h2>
          <p>Utilizamos cookies apenas para manter sua sessão ativa. Não utilizamos cookies de rastreamento ou publicidade.</p>
        </section>
        <section>
          <h2 className="font-semibold text-navy text-base mb-2">7. Contato</h2>
          <p>Dúvidas sobre privacidade: <a href="mailto:privacidade@cuida.me" className="text-blue-500 hover:underline">privacidade@cuida.me</a></p>
        </section>
      </div>
    </div>
  </div>
);

export default Privacy;