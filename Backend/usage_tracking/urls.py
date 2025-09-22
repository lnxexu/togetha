from django.urls import path
from .views import SessionTrackingView, UsageStatsView, IdleDetectionView

urlpatterns = [
    path('session/', SessionTrackingView.as_view(), name='session_tracking'),
    path('stats/', UsageStatsView.as_view(), name='usage_stats'),
    path('idle/', IdleDetectionView.as_view(), name='idle_detection'),
]