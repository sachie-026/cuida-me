import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft, ExternalLink, CheckCircle, AlertTriangle,
  Loader2, CreditCard, RefreshCw, BarChart3,
} from "lucide-react";
import axios from "axios";
import toast from "react-hot-toast";
import Logo from "../../components/common/Logo";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";
import ProfileMenu from "../../components/common/ProfileMenu";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

const StripeConnectPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);

  const isSuccess = searchParams.get("success") === "true";
  const isRefresh = searchParams.get("refresh") === "true";

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API}/api/payments/connect/status`, { headers });
      setStatus(res.data);
    } catch (err) {
      toast.error(t("stripe_connect.error_loading", "Erro ao carregar status da conta"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    if (isSuccess) {
      toast.success(t("stripe_connect.onboarding_success", "Cadastro Stripe concluído! Verificando status..."));
    }
    if (isRefresh) {
      toast.error(t("stripe_connect.onboarding_expired", "Link expirado. Clique para tentar novamente."));
    }
  }, []); // eslint-disable-line

  const startOnboarding = async () => {
    setOnboarding(true);
    try {
      const res = await axios.post(`${API}/api/payments/connect/onboard`, {}, { headers });
      if (res.data.mock) {
        toast.success(t("stripe_connect.mock_mode", "Modo desenvolvimento: conta simulada criada."));
        fetchStatus();
      } else if (res.data.onboarding_url) {
        window.location.href = res.data.onboarding_url;
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("stripe_connect.error_creating", "Erro ao criar conta Stripe"));
    } finally {
      setOnboarding(false);
    }
  };

  const openDashboard = async () => {
    try {
      const res = await axios.get(`${API}/api/payments/connect/dashboard-link`, { headers });
      if (res.data.url) {
        window.open(res.data.url, "_blank");
      } else {
        toast.error(t("stripe_connect.dashboard_unavailable", "Painel não disponível no modo desenvolvimento."));
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || t("stripe_connect.error_dashboard", "Erro ao abrir painel"));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  const isComplete = status?.onboarding_complete && status?.charges_enabled && status?.payouts_enabled;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/profile/professional")} className="text-gray-500 hover:text-gray-700">
            <ChevronLeft size={24} />
          </button>
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ProfileMenu />
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-6">
        <h1 className="text-xl font-bold text-gray-800">
          {t("stripe_connect.title", "Conta de Recebimento")}
        </h1>
        <p className="text-sm text-gray-600">
          {t("stripe_connect.description", "Configure sua conta Stripe para receber pagamentos automaticamente após cada atendimento. Você receberá 88% do valor do serviço diretamente na sua conta.")}
        </p>

        {/* Status Card */}
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4">
          <div className="flex items-center gap-3">
            <CreditCard className="text-purple-600" size={24} />
            <h2 className="font-semibold text-gray-800">
              {t("stripe_connect.account_status", "Status da Conta")}
            </h2>
          </div>

          {!status?.has_account ? (
            /* No account yet */
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-yellow-50 rounded-lg p-3">
                <AlertTriangle className="text-yellow-600 mt-0.5 shrink-0" size={18} />
                <p className="text-sm text-yellow-800">
                  {t("stripe_connect.no_account", "Você ainda não configurou sua conta de recebimento. Configure agora para receber pagamentos dos seus atendimentos.")}
                </p>
              </div>
              <button
                onClick={startOnboarding}
                disabled={onboarding}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {onboarding ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ExternalLink size={18} />
                )}
                {t("stripe_connect.setup_button", "Configurar Conta de Recebimento")}
              </button>
            </div>
          ) : isComplete ? (
            /* Fully onboarded */
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-green-50 rounded-lg p-3">
                <CheckCircle className="text-green-600 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    {t("stripe_connect.active", "Conta ativa e verificada")}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    {t("stripe_connect.active_desc", "Seus pagamentos serão depositados automaticamente após a confirmação do cliente.")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={openDashboard}
                  className="py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <BarChart3 size={16} />
                  {t("stripe_connect.view_dashboard", "Ver Painel")}
                </button>
                <button
                  onClick={fetchStatus}
                  className="py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} />
                  {t("stripe_connect.refresh", "Atualizar")}
                </button>
              </div>
            </div>
          ) : (
            /* Account exists but onboarding incomplete */
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-orange-50 rounded-lg p-3">
                <AlertTriangle className="text-orange-600 mt-0.5 shrink-0" size={18} />
                <div>
                  <p className="text-sm font-medium text-orange-800">
                    {t("stripe_connect.incomplete", "Cadastro incompleto")}
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    {t("stripe_connect.incomplete_desc", "Complete o cadastro na Stripe para começar a receber pagamentos.")}
                  </p>
                </div>
              </div>
              <button
                onClick={startOnboarding}
                disabled={onboarding}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {onboarding ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ExternalLink size={18} />
                )}
                {t("stripe_connect.complete_button", "Completar Cadastro")}
              </button>
              <button
                onClick={fetchStatus}
                className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} />
                {t("stripe_connect.refresh_status", "Atualizar Status")}
              </button>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">
            {t("stripe_connect.how_it_works", "Como funciona?")}
          </h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
              <p>{t("stripe_connect.step_1", "O cliente paga o valor total do serviço.")}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
              <p>{t("stripe_connect.step_2", "O pagamento fica retido até a conclusão do atendimento.")}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
              <p>{t("stripe_connect.step_3", "Após o cliente confirmar (ou 24h automático), o pagamento é dividido.")}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="bg-purple-100 text-purple-700 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</span>
              <p>{t("stripe_connect.step_4", "Você recebe 88% direto na sua conta. CuidaU retém 12% de comissão.")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StripeConnectPage;