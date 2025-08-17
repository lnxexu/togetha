from django.urls import path
from . import views

urlpatterns = [
    path('logs/', views.LogViewSet.as_view({'get': 'list'}), name='log-list'),
    path('logs/<int:pk>/', views.LogViewSet.as_view({'get': 'retrieve'}), name='log-detail'),
]