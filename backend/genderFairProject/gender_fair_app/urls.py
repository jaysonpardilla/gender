from django.urls import path
from . import views

urlpatterns = [
    # Auth endpoints
    path('auth/signup/', views.SignupView.as_view(), name='signup'),
    path('auth/login/', views.login_view, name='login'),
    path('auth/user/', views.current_user_view, name='current-user'),
    path('auth/change-password/', views.change_password_view, name='change-password'),
    path('auth/admin-exists/', views.admin_exists_view, name='admin-exists'),
    
    # Analysis endpoints
    path('analyze-text/', views.analyze_text_view, name='analyze-text'),
    path('upload-document/', views.upload_document_view, name='upload-document'),
    
    # Document/History endpoints
    path('history/', views.user_history_view, name='user-history'),
    path('document/<int:doc_id>/', views.document_detail_view, name='document-detail'),
    path('document/<int:doc_id>/download/', views.download_document_view, name='document-download'),
    path('generate-corrected-file/', views.generate_corrected_file_view, name='generate-corrected-file'),
    path('modify-pdf/', views.modify_pdf_view, name='modify-pdf'),
    path('modify-docx/', views.modify_docx_view, name='modify-docx'),
    
    # Dashboard endpoints
    path('dashboard/stats/', views.dashboard_stats_view, name='dashboard-stats'),
    path('dashboard/recent-analyses/', views.dashboard_recent_analyses_view, name='dashboard-recent-analyses'),
    path('dashboard/top-bias-words/', views.dashboard_top_bias_words_view, name='dashboard-top-bias-words'),
    path('bias-mappings/', views.bias_mappings_view, name='bias-mappings'),
    path('dashboard/documents-over-time/', views.dashboard_documents_over_time_view, name='dashboard-documents-over-time'),
    path('support-message/', views.support_message_view, name='support-message'),
    
    # Admin endpoints
    path('admin/users/', views.admin_all_users_view, name='admin-users'),
    path('admin/documents/', views.admin_all_documents_view, name='admin-documents'),
    path('admin/analytics/', views.admin_analytics_view, name='admin-analytics'),
    path('admin/support-messages/', views.admin_support_messages_view, name='admin-support-messages'),
    path('admin/support-messages/<int:message_id>/', views.admin_support_message_view, name='admin-support-message'),
    path('admin/dataset/', views.admin_dataset_view, name='admin-dataset'),
    path('admin/dataset/<int:mapping_id>/', views.admin_dataset_mapping_view, name='admin-dataset-mapping'),
    path('admin/dataset/import/', views.admin_dataset_import_view, name='admin-dataset-import'),
    path('admin/init-dataset/', views.init_dataset_view, name='init-dataset'),
    
    # Health check
    path('health/', views.health_check_view, name='health-check'),
]
