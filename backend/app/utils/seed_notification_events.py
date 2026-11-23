"""
Seed Notification Events
========================
Populates notification_events, notification_rules, notification_templates,
and notification_schedules with the ~45 event types from the spec.

Run once at startup (idempotent — skips if events already exist).
Called from main.py after migrations.

Channels scoped to: in_app (mandatory), email (optional, code-ready).
All templates in PT-BR.
"""
from sqlalchemy.orm import Session
from app.models.models import (
    NotificationEvent,
    NotificationRule,
    NotificationTemplate,
    NotificationSchedule,
)


# ── Event definitions ────────────────────────────────────────────────
# Each entry: (event_key, category, description, variables_list, rules)
# Each rule: (recipient, channels, priority, is_mandatory, action_link_tpl, templates, schedules)
# Each template: (channel, title, body, email_subject)
# Each schedule: (offset_minutes, reference)

EVENTS = [
    # ═══════════════════════════════════════════════════════════════
    # 1. ACCOUNT
    # ═══════════════════════════════════════════════════════════════
    ("account.welcome", "account", "New user registered", ["user_name"], [
        ("user", ["in_app"], "normal", True, "/profile", [
            ("in_app", "Bem-vindo(a) ao CuidaU!", "Olá {{user_name}}! Sua conta foi criada com sucesso. Complete seu perfil para começar.", None),
            ("email", "Bem-vindo(a) ao CuidaU!", "Olá {{user_name}}! Sua conta foi criada com sucesso. Complete seu perfil para começar a usar a plataforma.", "Bem-vindo(a) ao CuidaU!"),
        ], []),
    ]),

    ("account.profile_incomplete", "account", "Profile incomplete reminder", ["user_name", "missing_fields"], [
        ("user", ["in_app"], "normal", False, "/profile", [
            ("in_app", "Complete seu perfil", "{{user_name}}, faltam alguns dados no seu perfil: {{missing_fields}}. Complete para receber serviços."),
        ], [
            (1440, "signup"),  # 24h after signup
        ]),
    ]),

    ("account.document_submitted", "account", "Document submitted for review", ["user_name", "doc_type_label"], [
        ("user", ["in_app"], "normal", True, "/documents", [
            ("in_app", "Documento enviado", "Seu documento ({{doc_type_label}}) foi enviado e está em análise."),
        ], []),
    ]),

    ("account.document_approved", "account", "Document approved by admin", ["user_name", "doc_type_label"], [
        ("user", ["in_app"], "normal", True, "/documents", [
            ("in_app", "Documento aprovado ✓", "Seu documento ({{doc_type_label}}) foi aprovado."),
            ("email", "Documento aprovado", "Olá {{user_name}}, seu documento ({{doc_type_label}}) foi aprovado com sucesso.", "CuidaU — Documento aprovado"),
        ], []),
    ]),

    ("account.document_rejected", "account", "Document rejected by admin", ["user_name", "doc_type_label", "rejection_reason"], [
        ("user", ["in_app", "email"], "high", True, "/documents", [
            ("in_app", "Documento recusado", "Seu documento ({{doc_type_label}}) foi recusado. Motivo: {{rejection_reason}}. Envie novamente."),
            ("email", "Documento recusado — reenvie", "Olá {{user_name}}, seu documento ({{doc_type_label}}) foi recusado. Motivo: {{rejection_reason}}. Por favor, envie uma nova versão.", "CuidaU — Documento recusado"),
        ], []),
    ]),

    ("account.document_expiring", "account", "Document expiring soon", ["user_name", "doc_type_label", "expiry_date"], [
        ("user", ["in_app", "email"], "high", True, "/documents", [
            ("in_app", "Documento vence em breve", "Seu {{doc_type_label}} vence em {{expiry_date}}. Atualize para manter seu perfil ativo."),
            ("email", "Documento vencendo", "Olá {{user_name}}, seu {{doc_type_label}} vence em {{expiry_date}}. Atualize o documento para continuar recebendo serviços.", "CuidaU — Documento vencendo"),
        ], [
            (-4320, "expiry"),   # 3 days before expiry
        ]),
    ]),

    ("account.professional_activated", "account", "Professional account activated", ["user_name"], [
        ("professional", ["in_app", "email"], "high", True, "/bookings", [
            ("in_app", "Perfil ativado! 🎉", "Parabéns {{user_name}}! Seu perfil foi ativado. Você já pode receber solicitações de serviço."),
            ("email", "Seu perfil foi ativado!", "Parabéns {{user_name}}! Seu perfil profissional no CuidaU foi ativado. Agora você pode receber e aceitar solicitações de serviço.", "CuidaU — Perfil ativado!"),
        ], []),
    ]),

    ("account.professional_suspended", "account", "Professional account suspended", ["user_name", "reason"], [
        ("professional", ["in_app", "email"], "urgent", True, "/profile", [
            ("in_app", "Perfil suspenso", "Seu perfil foi suspenso. Motivo: {{reason}}. Entre em contato com o suporte."),
            ("email", "Perfil suspenso", "Olá {{user_name}}, seu perfil profissional foi suspenso. Motivo: {{reason}}. Entre em contato com nosso suporte para mais informações.", "CuidaU — Perfil suspenso"),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 2. BOOKING
    # ═══════════════════════════════════════════════════════════════
    ("booking.requested", "booking", "New booking request", ["client_name", "service", "booking_date", "booking_time", "neighborhood", "booking_code", "response_deadline"], [
        ("professional", ["in_app", "email"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Nova solicitação de serviço", "{{client_name}} solicitou {{service}} em {{neighborhood}} para {{booking_date}} às {{booking_time}}. Código: {{booking_code}}. Responda em até {{response_deadline}}."),
            ("email", "Nova solicitação de serviço", "Olá, você recebeu uma nova solicitação:\n\nCliente: {{client_name}}\nServiço: {{service}}\nLocal: {{neighborhood}}\nData: {{booking_date}} às {{booking_time}}\nCódigo: {{booking_code}}\n\nResponda em até {{response_deadline}}.", "CuidaU — Nova solicitação #{{booking_code}}"),
        ], []),
    ]),

    ("booking.accepted", "booking", "Booking accepted by professional", ["professional_name", "service", "booking_date", "booking_time", "booking_code"], [
        ("client", ["in_app", "email"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Serviço confirmado ✓", "{{professional_name}} aceitou seu pedido de {{service}} para {{booking_date}} às {{booking_time}}. Código: {{booking_code}}."),
            ("email", "Serviço confirmado!", "Seu pedido de {{service}} foi aceito por {{professional_name}}.\n\nData: {{booking_date}} às {{booking_time}}\nCódigo: {{booking_code}}", "CuidaU — Serviço confirmado #{{booking_code}}"),
        ], []),
    ]),

    ("booking.cancelled_by_client", "booking", "Booking cancelled by client", ["client_name", "service", "booking_date", "booking_code", "cancellation_reason"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Serviço cancelado", "{{client_name}} cancelou o serviço de {{service}} em {{booking_date}}. Código: {{booking_code}}. Motivo: {{cancellation_reason}}."),
        ], []),
    ]),

    ("booking.cancelled_by_professional", "booking", "Booking cancelled by professional", ["professional_name", "service", "booking_date", "booking_code", "cancellation_reason"], [
        ("client", ["in_app", "email"], "high", True, "/bookings", [
            ("in_app", "Serviço cancelado", "{{professional_name}} cancelou o serviço de {{service}} em {{booking_date}}. Código: {{booking_code}}. Motivo: {{cancellation_reason}}."),
            ("email", "Serviço cancelado", "Infelizmente, {{professional_name}} cancelou o serviço:\n\nServiço: {{service}}\nData: {{booking_date}}\nCódigo: {{booking_code}}\nMotivo: {{cancellation_reason}}\n\nVocê pode solicitar outro profissional.", "CuidaU — Serviço cancelado #{{booking_code}}"),
        ], []),
    ]),

    ("booking.reminder_client", "booking", "Booking reminder for client", ["professional_name", "service", "booking_date", "booking_time", "booking_code"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Lembrete de serviço", "Seu serviço de {{service}} com {{professional_name}} é amanhã ({{booking_date}}) às {{booking_time}}. Código: {{booking_code}}."),
        ], [
            (-1440, "booking_start"),  # 24h before
        ]),
    ]),

    ("booking.reminder_professional", "booking", "Booking reminder for professional", ["client_name", "service", "booking_date", "booking_time", "neighborhood", "booking_code"], [
        ("professional", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Lembrete de serviço", "Você tem um serviço de {{service}} para {{client_name}} amanhã ({{booking_date}}) às {{booking_time}} em {{neighborhood}}. Código: {{booking_code}}."),
        ], [
            (-1440, "booking_start"),  # 24h before
        ]),
    ]),

    ("booking.reminder_2h", "booking", "2h before booking reminder", ["service", "booking_time", "booking_code"], [
        ("both", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Serviço em 2 horas", "Seu serviço de {{service}} começa às {{booking_time}}. Código: {{booking_code}}. Prepare-se!"),
        ], [
            (-120, "booking_start"),  # 2h before
        ]),
    ]),

    ("booking.no_response", "booking", "Professional did not respond in time", ["service", "booking_date", "booking_code"], [
        ("client", ["in_app"], "high", True, "/bookings", [
            ("in_app", "Sem resposta do profissional", "O profissional não respondeu à solicitação de {{service}} para {{booking_date}}. Código: {{booking_code}}. Estamos buscando outro profissional."),
        ], []),
        ("professional", ["in_app"], "high", True, "/bookings", [
            ("in_app", "Solicitação expirada", "Você não respondeu a tempo à solicitação de {{service}} para {{booking_date}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 3. DURING SERVICE
    # ═══════════════════════════════════════════════════════════════
    ("service.professional_arrived", "service", "Professional arrived at location", ["professional_name", "booking_code"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Profissional chegou", "{{professional_name}} chegou ao local. Código: {{booking_code}}."),
        ], []),
    ]),

    ("service.checked_in", "service", "Service started (check-in)", ["professional_name", "service", "booking_code", "start_time"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Serviço iniciado", "{{professional_name}} iniciou o serviço de {{service}} às {{start_time}}. Código: {{booking_code}}."),
        ], []),
    ]),

    ("service.completed", "service", "Service completed (check-out)", ["professional_name", "service", "booking_code", "duration", "total_amount"], [
        ("client", ["in_app", "email"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Serviço concluído ✓", "{{professional_name}} concluiu o serviço de {{service}}. Duração: {{duration}}. Valor: R$ {{total_amount}}. Código: {{booking_code}}."),
            ("email", "Serviço concluído", "O serviço de {{service}} foi concluído.\n\nProfissional: {{professional_name}}\nDuração: {{duration}}\nValor: R$ {{total_amount}}\nCódigo: {{booking_code}}", "CuidaU — Serviço concluído #{{booking_code}}"),
        ], []),
    ]),

    ("service.no_show_client", "service", "Client no-show", ["client_name", "service", "booking_code"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Cliente não compareceu", "{{client_name}} não compareceu ao serviço de {{service}}. Código: {{booking_code}}. Uma penalidade pode ser aplicada."),
        ], []),
        ("client", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Ausência registrada", "Você não compareceu ao serviço de {{service}}. Código: {{booking_code}}. Uma penalidade pode ser aplicada."),
        ], []),
    ]),

    ("service.no_show_professional", "service", "Professional no-show", ["professional_name", "service", "booking_code"], [
        ("client", ["in_app", "email"], "urgent", True, "/bookings/{{booking_id}}", [
            ("in_app", "Profissional não compareceu", "{{professional_name}} não compareceu ao serviço de {{service}}. Código: {{booking_code}}. Estamos resolvendo a situação."),
            ("email", "Profissional não compareceu", "Lamentamos informar que {{professional_name}} não compareceu ao serviço de {{service}} (Código: {{booking_code}}). Nossa equipe está cuidando da situação.", "CuidaU — Ausência do profissional #{{booking_code}}"),
        ], []),
        ("professional", ["in_app"], "urgent", True, "/bookings/{{booking_id}}", [
            ("in_app", "Ausência registrada", "Você não compareceu ao serviço de {{service}}. Código: {{booking_code}}. Uma penalidade será aplicada."),
        ], []),
    ]),

    ("service.extended", "service", "Service extended beyond scheduled time", ["service", "booking_code", "extra_time", "extra_amount"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Serviço estendido", "O serviço de {{service}} foi estendido em {{extra_time}}. Valor adicional: R$ {{extra_amount}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 4. MESSAGES
    # ═══════════════════════════════════════════════════════════════
    ("message.new", "message", "New message received", ["sender_name", "message_preview"], [
        ("other_party", ["in_app"], "normal", False, "/messages", [
            ("in_app", "Nova mensagem", "{{sender_name}}: {{message_preview}}"),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 5. PAYMENT
    # ═══════════════════════════════════════════════════════════════
    ("payment.authorized", "payment", "Payment authorized (held in escrow)", ["service", "booking_code", "amount"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Pagamento autorizado", "Pagamento de R$ {{amount}} autorizado para o serviço de {{service}}. Código: {{booking_code}}. O valor será liberado após a conclusão."),
        ], []),
    ]),

    ("payment.captured", "payment", "Payment captured after service", ["service", "booking_code", "amount"], [
        ("client", ["in_app", "email"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Pagamento confirmado", "Pagamento de R$ {{amount}} confirmado para {{service}}. Código: {{booking_code}}."),
            ("email", "Pagamento confirmado", "Seu pagamento de R$ {{amount}} foi confirmado para o serviço de {{service}} (Código: {{booking_code}}).", "CuidaU — Pagamento confirmado #{{booking_code}}"),
        ], []),
    ]),

    ("payment.released_to_professional", "payment", "Payment released to professional", ["amount", "booking_code", "service"], [
        ("professional", ["in_app", "email"], "high", True, "/payments", [
            ("in_app", "Pagamento liberado 💰", "R$ {{amount}} foi liberado para sua conta referente ao serviço de {{service}}. Código: {{booking_code}}."),
            ("email", "Pagamento liberado", "O valor de R$ {{amount}} foi liberado para sua conta referente ao serviço de {{service}} (Código: {{booking_code}}).", "CuidaU — Pagamento liberado #{{booking_code}}"),
        ], []),
    ]),

    ("payment.failed", "payment", "Payment failed", ["service", "booking_code", "amount", "error_message"], [
        ("client", ["in_app", "email"], "urgent", True, "/payments", [
            ("in_app", "Falha no pagamento", "O pagamento de R$ {{amount}} para {{service}} falhou. Código: {{booking_code}}. Tente novamente."),
            ("email", "Falha no pagamento", "O pagamento de R$ {{amount}} para o serviço de {{service}} (Código: {{booking_code}}) não foi processado. Por favor, tente novamente ou use outro método de pagamento.", "CuidaU — Falha no pagamento #{{booking_code}}"),
        ], []),
    ]),

    ("payment.refund_issued", "payment", "Refund issued to client", ["amount", "booking_code", "refund_reason"], [
        ("client", ["in_app", "email"], "high", True, "/payments", [
            ("in_app", "Reembolso processado", "Reembolso de R$ {{amount}} processado. Código: {{booking_code}}. Motivo: {{refund_reason}}."),
            ("email", "Reembolso processado", "Um reembolso de R$ {{amount}} foi processado para a reserva #{{booking_code}}. Motivo: {{refund_reason}}. O valor será creditado em sua conta em até 10 dias úteis.", "CuidaU — Reembolso processado #{{booking_code}}"),
        ], []),
    ]),

    ("payment.dispute_opened", "payment", "Dispute opened on a payment", ["booking_code", "service", "dispute_reason"], [
        ("professional", ["in_app"], "urgent", True, "/bookings/{{booking_id}}", [
            ("in_app", "Contestação aberta", "O cliente abriu uma contestação sobre o serviço de {{service}}. Código: {{booking_code}}. Motivo: {{dispute_reason}}."),
        ], []),
        ("admin", ["in_app"], "urgent", True, "/admin/disputes", [
            ("in_app", "Nova contestação", "Contestação aberta para o serviço de {{service}}. Código: {{booking_code}}. Motivo: {{dispute_reason}}."),
        ], []),
    ]),

    ("payment.dispute_resolved", "payment", "Dispute resolved", ["booking_code", "resolution"], [
        ("both", ["in_app", "email"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Contestação resolvida", "A contestação do serviço #{{booking_code}} foi resolvida. Resultado: {{resolution}}."),
            ("email", "Contestação resolvida", "A contestação referente ao serviço #{{booking_code}} foi resolvida. Resultado: {{resolution}}.", "CuidaU — Contestação resolvida #{{booking_code}}"),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 6. RATINGS
    # ═══════════════════════════════════════════════════════════════
    ("rating.received", "rating", "New rating received", ["rater_name", "rating_value", "service", "booking_code"], [
        ("other_party", ["in_app"], "normal", False, "/ratings", [
            ("in_app", "Nova avaliação", "{{rater_name}} avaliou o serviço de {{service}} com {{rating_value}} estrelas. Código: {{booking_code}}."),
        ], []),
    ]),

    ("rating.reminder", "rating", "Reminder to rate a completed service", ["service", "professional_name", "booking_code"], [
        ("client", ["in_app"], "normal", False, "/bookings/{{booking_id}}", [
            ("in_app", "Avalie o serviço", "Como foi o serviço de {{service}} com {{professional_name}}? Código: {{booking_code}}. Sua avaliação ajuda outros clientes!"),
        ], [
            (1440, "event"),  # 24h after service completed
        ]),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 7. PENALTIES
    # ═══════════════════════════════════════════════════════════════
    ("penalty.applied", "penalty", "Penalty applied to user", ["penalty_type", "penalty_amount", "reason", "booking_code"], [
        ("user", ["in_app", "email"], "urgent", True, "/penalties", [
            ("in_app", "Penalidade aplicada", "Uma penalidade de R$ {{penalty_amount}} foi aplicada ({{penalty_type}}). Motivo: {{reason}}. Referência: {{booking_code}}."),
            ("email", "Penalidade aplicada", "Uma penalidade de R$ {{penalty_amount}} ({{penalty_type}}) foi aplicada à sua conta.\n\nMotivo: {{reason}}\nReferência: {{booking_code}}\n\nEm caso de dúvidas, entre em contato com o suporte.", "CuidaU — Penalidade aplicada"),
        ], []),
    ]),

    ("penalty.warning", "penalty", "Warning before penalty", ["warning_type", "reason", "booking_code"], [
        ("user", ["in_app"], "high", True, None, [
            ("in_app", "Aviso de penalidade", "Atenção: {{warning_type}}. Motivo: {{reason}}. Referência: {{booking_code}}. Próxima ocorrência resultará em penalidade."),
        ], []),
    ]),

    ("penalty.strike", "penalty", "Strike added to account", ["strike_count", "max_strikes", "reason"], [
        ("user", ["in_app", "email"], "urgent", True, "/penalties", [
            ("in_app", "Strike registrado", "Você recebeu o strike {{strike_count}} de {{max_strikes}}. Motivo: {{reason}}. Atenção: {{max_strikes}} strikes resultam em suspensão."),
            ("email", "Strike registrado na sua conta", "Você recebeu o strike {{strike_count}} de {{max_strikes}} na sua conta CuidaU. Motivo: {{reason}}. Atingir {{max_strikes}} strikes resulta em suspensão da conta.", "CuidaU — Strike registrado"),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 8. ALERTS
    # ═══════════════════════════════════════════════════════════════
    ("alert.emergency", "alert", "Emergency SOS triggered", ["professional_name", "client_name", "booking_code", "location"], [
        ("admin", ["in_app", "email"], "urgent", True, "/admin/alerts", [
            ("in_app", "🚨 EMERGÊNCIA SOS", "Alerta de emergência! Profissional: {{professional_name}}, Cliente: {{client_name}}. Código: {{booking_code}}. Local: {{location}}."),
            ("email", "🚨 EMERGÊNCIA SOS", "ALERTA DE EMERGÊNCIA!\n\nProfissional: {{professional_name}}\nCliente: {{client_name}}\nCódigo: {{booking_code}}\nLocal: {{location}}\n\nAção imediata necessária.", "CuidaU — EMERGÊNCIA SOS #{{booking_code}}"),
        ], []),
    ]),

    ("alert.gps_mismatch", "alert", "GPS location mismatch at check-in", ["professional_name", "booking_code", "expected_location", "actual_location"], [
        ("admin", ["in_app"], "high", True, "/admin/alerts", [
            ("in_app", "GPS divergente", "Profissional {{professional_name}} fez check-in com localização divergente. Código: {{booking_code}}. Esperado: {{expected_location}}, Real: {{actual_location}}."),
        ], []),
    ]),

    ("alert.late_checkin", "alert", "Professional late for check-in", ["professional_name", "booking_code", "minutes_late"], [
        ("client", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Profissional atrasado", "{{professional_name}} está {{minutes_late}} minutos atrasado(a) para o serviço. Código: {{booking_code}}."),
        ], []),
        ("admin", ["in_app"], "normal", False, "/admin/alerts", [
            ("in_app", "Check-in atrasado", "Profissional {{professional_name}} atrasado {{minutes_late}}min. Código: {{booking_code}}."),
        ], []),
    ]),

    ("alert.checkout_overdue", "alert", "Checkout not done after scheduled end", ["professional_name", "booking_code", "scheduled_end"], [
        ("admin", ["in_app"], "high", True, "/admin/alerts", [
            ("in_app", "Checkout pendente", "Profissional {{professional_name}} não fez checkout. Horário previsto: {{scheduled_end}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # ═══════════════════════════════════════════════════════════════
    # 9. ADMIN
    # ═══════════════════════════════════════════════════════════════
    ("admin.new_professional_signup", "admin", "New professional registered", ["professional_name", "professional_role"], [
        ("admin", ["in_app"], "normal", True, "/admin/professionals", [
            ("in_app", "Novo profissional", "{{professional_name}} ({{professional_role}}) se cadastrou. Documentos pendentes de análise."),
        ], []),
    ]),

    ("admin.document_pending_review", "admin", "Document awaiting admin review", ["professional_name", "doc_type_label", "doc_count"], [
        ("admin", ["in_app"], "normal", True, "/admin/documents", [
            ("in_app", "Documento para análise", "{{professional_name}} enviou {{doc_type_label}} para análise. Total pendentes: {{doc_count}}."),
        ], []),
    ]),

    ("admin.high_cancellation_rate", "admin", "User has high cancellation rate", ["user_name", "cancellation_rate", "period"], [
        ("admin", ["in_app"], "high", True, "/admin/users", [
            ("in_app", "Taxa de cancelamento alta", "{{user_name}} tem taxa de cancelamento de {{cancellation_rate}}% no período {{period}}."),
        ], []),
    ]),

    ("admin.payout_ready", "admin", "Payouts ready for processing", ["payout_count", "total_amount"], [
        ("admin", ["in_app"], "normal", True, "/admin/payouts", [
            ("in_app", "Pagamentos para processar", "{{payout_count}} pagamentos prontos para liberação. Total: R$ {{total_amount}}."),
        ], []),
    ]),

    ("admin.system_error", "admin", "System error detected", ["error_type", "error_message", "affected_service"], [
        ("admin", ["in_app", "email"], "urgent", True, "/admin/system", [
            ("in_app", "⚠️ Erro no sistema", "Erro {{error_type}} detectado em {{affected_service}}: {{error_message}}."),
            ("email", "Erro no sistema", "Erro detectado no CuidaU:\n\nTipo: {{error_type}}\nServiço: {{affected_service}}\nMensagem: {{error_message}}\n\nVerifique imediatamente.", "CuidaU — ⚠️ Erro no sistema"),
        ], []),
    ]),

    ("admin.daily_summary", "admin", "Daily platform summary", ["date", "bookings_count", "revenue", "new_users", "active_professionals"], [
        ("admin", ["in_app", "email"], "normal", False, "/admin/dashboard", [
            ("in_app", "Resumo diário", "Resumo de {{date}}: {{bookings_count}} serviços, R$ {{revenue}} em receita, {{new_users}} novos usuários, {{active_professionals}} profissionais ativos."),
            ("email", "Resumo diário CuidaU", "Resumo da plataforma — {{date}}:\n\n• Serviços: {{bookings_count}}\n• Receita: R$ {{revenue}}\n• Novos usuários: {{new_users}}\n• Profissionais ativos: {{active_professionals}}", "CuidaU — Resumo diário {{date}}"),
        ], []),
    ]),

    # ── Admin → User direct message ──
    ("admin.message", "admin", "Admin message to user", ["title", "message", "admin_name"], [
        ("other_party", ["in_app", "email"], "normal", False, "/notifications", [
            ("in_app", "{{title}}", "{{message}}"),
            ("email", "{{title}}", "{{message}}\n\nEquipe CuidaU", "CuidaU — {{title}}"),
        ], []),
    ]),
]


def seed_notification_events(db: Session):
    """
    Seed all notification events, rules, templates, and schedules.
    Idempotent: skips if events already exist.
    """
    existing = db.query(NotificationEvent).count()
    if existing > 0:
        print(f"[SEED] {existing} notification events already exist — skipping seed.")
        return

    print("[SEED] Seeding notification events...")
    count_events = 0
    count_rules = 0
    count_templates = 0
    count_schedules = 0

    for event_key, category, description, variables, rules_data in EVENTS:
        event = NotificationEvent(
            event_key=event_key,
            category=category,
            description=description,
            variables=variables,
        )
        db.add(event)
        db.flush()
        count_events += 1

        for recipient, channels, priority, is_mandatory, action_link, templates, schedules in rules_data:
            rule = NotificationRule(
                event_id=event.id,
                recipient=recipient,
                channels=channels,
                priority=priority,
                is_active=True,
                is_mandatory=is_mandatory,
                action_link=action_link,
            )
            db.add(rule)
            db.flush()
            count_rules += 1

            for tmpl_data in templates:
                channel = tmpl_data[0]
                title = tmpl_data[1]
                body = tmpl_data[2]
                email_subject = tmpl_data[3] if len(tmpl_data) > 3 else None

                template = NotificationTemplate(
                    rule_id=rule.id,
                    channel=channel,
                    language="pt-BR",
                    title=title,
                    body=body,
                    email_subject=email_subject,
                )
                db.add(template)
                count_templates += 1

            for offset_minutes, reference in schedules:
                schedule = NotificationSchedule(
                    rule_id=rule.id,
                    offset_minutes=offset_minutes,
                    reference=reference,
                    is_active=True,
                )
                db.add(schedule)
                count_schedules += 1

    db.commit()
    print(f"[SEED] Done: {count_events} events, {count_rules} rules, {count_templates} templates, {count_schedules} schedules.")


# ── Additional events added post-initial seed ────────────────────────────────
# These are inserted individually (checking by event_key) so they work even
# when the main seed above has already run and skipped.

ADDITIONAL_EVENTS = [
    # Admin: notified when a new booking is requested
    ("admin.booking_requested", "admin", "Admin notified of new booking request",
     ["client_name", "professional_name", "service", "booking_date", "booking_time", "booking_code"], [
        ("admin", ["in_app"], "normal", True, "/admin/bookings", [
            ("in_app", "Nova reserva solicitada",
             "{{client_name}} solicitou {{service}} com {{professional_name}} para {{booking_date}} às {{booking_time}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Admin: notified when a booking is accepted
    ("admin.booking_accepted", "admin", "Admin notified booking was accepted",
     ["professional_name", "client_name", "service", "booking_date", "booking_code"], [
        ("admin", ["in_app"], "normal", True, "/admin/bookings", [
            ("in_app", "Reserva aceita",
             "{{professional_name}} aceitou o serviço de {{service}} para {{client_name}} em {{booking_date}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Admin: notified when payment is received (authorized)
    ("admin.payment_received", "admin", "Admin notified of payment received",
     ["client_name", "amount", "service", "booking_code"], [
        ("admin", ["in_app"], "normal", True, "/admin/payments", [
            ("in_app", "Pagamento recebido",
             "Pagamento de R$ {{amount}} recebido de {{client_name}} para {{service}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Admin: notified when payment is released to professional
    ("admin.payment_released", "admin", "Admin notified payment released to professional",
     ["professional_name", "amount", "commission", "service", "booking_code"], [
        ("admin", ["in_app"], "normal", True, "/admin/payments", [
            ("in_app", "Pagamento liberado",
             "R$ {{amount}} liberado para {{professional_name}} (comissão: R$ {{commission}}). Serviço: {{service}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Professional: wallet credited notification
    ("payment.wallet_credited", "payment", "Professional wallet credited after payment release",
     ["amount", "service", "booking_code"], [
        ("professional", ["in_app"], "normal", True, "/earnings", [
            ("in_app", "Carteira creditada 💰",
             "R$ {{amount}} foi creditado na sua carteira referente ao serviço de {{service}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Admin: platform wallet commission credited
    ("admin.commission_received", "admin", "Platform commission credited to wallet",
     ["amount", "service", "booking_code", "professional_name"], [
        ("admin", ["in_app"], "normal", True, "/admin/wallet", [
            ("in_app", "Comissão recebida",
             "Comissão de R$ {{amount}} creditada ({{service}} — {{professional_name}}). Código: {{booking_code}}."),
        ], []),
    ]),

    # Change 44a — Quick messages (one-tap chips in chat + booking screen)
    # Professional → client: "Estou a caminho"
    ("service.on_the_way", "service", "Professional is on the way",
     ["professional_name", "service", "booking_code"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Profissional a caminho 🚗",
             "{{professional_name}} está a caminho para o serviço de {{service}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Client → professional: "Pode chegar"
    ("service.client_ready", "service", "Client is ready — professional can arrive",
     ["client_name", "service", "booking_code"], [
        ("professional", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Cliente está pronto ✓",
             "{{client_name}} avisou que já pode chegar. Serviço: {{service}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Client → professional: "Estou aguardando"
    ("service.client_waiting", "service", "Client is waiting at the service address",
     ["client_name", "service", "booking_code"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Cliente aguardando ⏱",
             "{{client_name}} está aguardando no local. Serviço: {{service}}. Código: {{booking_code}}."),
        ], []),
    ]),

    # Change 44b — Late arrival (pro didn't check in within 15 min of scheduled_start)
    ("service.late_arrival", "service", "Professional late arrival — 15 min past scheduled start without check-in",
     ["professional_name", "service", "booking_code"], [
        ("client", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Atraso do profissional ⏱",
             "{{professional_name}} ainda não fez check-in. Serviço: {{service}}. Código: {{booking_code}}. Estamos monitorando."),
        ], []),
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Atraso registrado",
             "Você ainda não fez check-in no serviço de {{service}}. Código: {{booking_code}}. Chegadas tardias contam para penalidades."),
        ], []),
    ]),

    # +25 min reminder: "O atendimento já foi iniciado?"
    # Scheduler filters by status == accepted, so this only fires if the pro
    # hasn't checked in yet (checkin bumps status to checked_in).
    ("service.checkin_reminder", "service", "Checkin reminder to client — service not started yet",
     ["professional_name", "service", "booking_code"], [
        ("client", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "O profissional já chegou?",
             "O profissional ainda não iniciou o atendimento de {{service}}. Código: {{booking_code}}. Ele está com você? Confirme no app ou aguarde a reatribuição automática."),
        ], [
            (25, "booking_start"),  # +25 min after booking.scheduled_start
        ]),
    ]),

    # Rule #1 (23/11/2026) — mirror +25 min reminder to the PROFESSIONAL so
    # both sides are nudged at the same moment: the pro gets a "start now or
    # lose this booking" prompt; the client gets the "is the pro with you?"
    # prompt above. 5 min after this reminder (= T+30) the auto no-show
    # sweep flips un-started bookings to no_show.
    ("service.checkin_reminder_pro", "service", "Checkin reminder to professional — start now or risk no-show",
     ["service", "booking_code"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Inicie o atendimento agora",
             "Você ainda não iniciou o atendimento de {{service}} (código {{booking_code}}). Em 5 min o sistema registrará como não comparecimento e o pagamento não será liberado."),
        ], [
            (25, "booking_start"),
        ]),
    ]),

    # Rule #1 (23/11/2026) — client has confirmed pro presence past T+30, so
    # the pro can start under admin review. Non-scheduled (fires inline from
    # the confirm-pro-presence endpoint).
    ("service.client_confirmed_pro_presence", "service", "Client confirmed professional is on site after the +30 min cutoff",
     ["client_name", "service", "booking_code"], [
        ("professional", ["in_app"], "urgent", True, "/bookings/{{booking_id}}", [
            ("in_app", "Cliente confirmou sua presença ✓",
             "{{client_name}} confirmou que você está no local. Você já pode iniciar o atendimento de {{service}} (código {{booking_code}}). Este caso será revisado pelo suporte."),
        ], []),
    ]),

    # Rule (23/11/2026) — system auto-finished a booking the pro left in
    # checked_in past scheduled_end + 30 min. Payment stays based on the
    # scheduled time; the row is flagged for admin review.
    ("service.auto_finished", "service", "Service auto-finished at scheduled end (pro did not finalize within 30 min cutoff)",
     ["professional_name", "service", "booking_code"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Atendimento encerrado automaticamente",
             "O atendimento de {{service}} (código {{booking_code}}) foi finalizado automaticamente pelo sistema, pois o checkout não foi feito dentro do prazo de 30 min. O pagamento considera o horário agendado. Este caso será revisado pelo suporte."),
        ], []),
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Atendimento finalizado",
             "O atendimento de {{service}} com {{professional_name}} (código {{booking_code}}) foi finalizado automaticamente no horário agendado. Se algo estiver incorreto, nossa equipe entrará em contato."),
        ], []),
    ]),

    # Rule #5 (23/11/2026) — client requested a service extension.
    ("service.extension_requested_pro", "service", "Client requested a service extension — professional must accept or decline",
     ["service", "booking_code", "additional_minutes", "additional_cost"], [
        ("professional", ["in_app"], "urgent", True, "/bookings/{{booking_id}}", [
            ("in_app", "Pedido de extensão do atendimento",
             "O cliente pediu uma extensão de {{additional_minutes}} min no atendimento de {{service}} (código {{booking_code}}). Valor adicional: R$ {{additional_cost}}. Aceite ou recuse no app antes do término do atendimento."),
        ], []),
    ]),
    # Legacy path — pro-initiated extension (kept for backward compatibility).
    ("service.extension_requested_client", "service", "Professional proposed a service extension — client must accept or decline",
     ["service", "booking_code", "additional_minutes", "additional_cost"], [
        ("client", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Profissional pediu extensão",
             "O profissional pediu uma extensão de {{additional_minutes}} min no atendimento de {{service}} (código {{booking_code}}). Valor adicional: R$ {{additional_cost}}."),
        ], []),
    ]),

    # Rule #5 — pro accepted; extension confirmed and payment went through.
    ("service.extension_confirmed", "service", "Service extension confirmed — new end time and charge applied",
     ["service", "booking_code", "new_end", "additional_cost"], [
        ("client", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Extensão confirmada ✓",
             "A extensão do atendimento de {{service}} (código {{booking_code}}) foi confirmada. Novo término: {{new_end}}. Valor adicional cobrado: R$ {{additional_cost}}."),
        ], []),
    ]),

    # Rule #5 — pro declined; original schedule stays.
    ("service.extension_declined", "service", "Service extension declined — original schedule stays",
     ["service", "booking_code"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Extensão recusada",
             "O profissional recusou a extensão do atendimento de {{service}} (código {{booking_code}}). O horário original permanece."),
        ], []),
        ("professional", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Extensão recusada",
             "A extensão do atendimento de {{service}} (código {{booking_code}}) foi recusada. O horário original permanece."),
        ], []),
    ]),

    # Rule #5 — payment failed on the extension; original schedule stays.
    ("service.extension_payment_failed", "service", "Service extension payment failed — original schedule stays",
     ["service", "booking_code", "additional_cost"], [
        ("client", ["in_app"], "urgent", True, "/bookings/{{booking_id}}", [
            ("in_app", "Falha no pagamento da extensão",
             "O pagamento de R$ {{additional_cost}} da extensão falhou. O atendimento de {{service}} (código {{booking_code}}) segue com o horário original. Verifique seu método de pagamento."),
        ], []),
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Extensão não efetivada",
             "O pagamento da extensão do atendimento de {{service}} (código {{booking_code}}) não foi concluído. O horário original permanece."),
        ], []),
    ]),

    # Rule #5 — extension request expired (pro didn't answer by scheduled_end).
    ("service.extension_expired", "service", "Service extension request expired without professional response",
     ["service", "booking_code"], [
        ("client", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Pedido de extensão expirou",
             "O profissional não respondeu ao pedido de extensão do atendimento de {{service}} (código {{booking_code}}) a tempo. O horário original permanece."),
        ], []),
        ("professional", ["in_app"], "normal", True, "/bookings/{{booking_id}}", [
            ("in_app", "Pedido de extensão expirou",
             "O pedido de extensão do atendimento de {{service}} (código {{booking_code}}) expirou sem resposta."),
        ], []),
    ]),

    # Rule #6 (23/11/2026) — at scheduled_end, if the service is still open,
    # nudge the pro to finish it so payment can be released. Precedes the
    # hard auto-finish sweep at T_end + 30 min.
    ("service.finish_reminder", "service", "Service ended — reminder for the professional to tap Finish",
     ["service", "booking_code", "end_time"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Finalize o atendimento no app",
             "Seu atendimento terminou às {{end_time}}. Finalize-o no app para receber o pagamento. Código: {{booking_code}}."),
        ], []),
    ]),

    # Rule #6 — the pro's next booking starts within 10 min and the current
    # one is still in progress. Soft nudge so they can finish before tapping
    # Start on the next one (which would also trigger the "Finalizar anterior
    # e iniciar?" dialog from Rule #3).
    ("service.finish_before_next", "service", "Next booking in 10 min — finish the current one first",
     ["service", "booking_code", "next_service", "next_booking_code", "next_start_time"], [
        ("professional", ["in_app"], "high", True, "/bookings/{{booking_id}}", [
            ("in_app", "Finalize para iniciar o próximo",
             "Seu próximo atendimento ({{next_service}} — {{next_booking_code}}) começa às {{next_start_time}}. Finalize o atendimento atual ({{booking_code}}) para poder iniciar o próximo."),
        ], []),
    ]),
]


def seed_missing_events(db: Session):
    """
    Seed additional notification events that were added after the initial seed.
    Checks each event_key individually — safe to run multiple times.
    """
    added = 0
    for event_key, category, description, variables, rules_data in ADDITIONAL_EVENTS:
        existing = db.query(NotificationEvent).filter(
            NotificationEvent.event_key == event_key
        ).first()
        if existing:
            continue

        event = NotificationEvent(
            event_key=event_key,
            category=category,
            description=description,
            variables=variables,
        )
        db.add(event)
        db.flush()

        for recipient, channels, priority, is_mandatory, action_link, templates, schedules in rules_data:
            rule = NotificationRule(
                event_id=event.id,
                recipient=recipient,
                channels=channels,
                priority=priority,
                is_active=True,
                is_mandatory=is_mandatory,
                action_link=action_link,
            )
            db.add(rule)
            db.flush()

            for tmpl_data in templates:
                channel = tmpl_data[0]
                title = tmpl_data[1]
                body = tmpl_data[2]
                email_subject = tmpl_data[3] if len(tmpl_data) > 3 else None
                template = NotificationTemplate(
                    rule_id=rule.id,
                    channel=channel,
                    language="pt-BR",
                    title=title,
                    body=body,
                    email_subject=email_subject,
                )
                db.add(template)

            for offset_minutes, reference in schedules:
                schedule = NotificationSchedule(
                    rule_id=rule.id,
                    offset_minutes=offset_minutes,
                    reference=reference,
                    is_active=True,
                )
                db.add(schedule)

        added += 1

    if added:
        db.commit()
        print(f"[SEED] Added {added} new notification events.")
    else:
        print("[SEED] No new notification events to add.")