from django.urls import path, re_path
from . import views

urlpatterns = [
    re_path(r'^tasks/$', views.task_list, name='task-list'),
    re_path(r'^tasks/(?P<pk>[^/.]+)/$', views.task_detail, name='task-detail'),
    re_path(r'^categories/$', views.category_list, name='category-list'),
    re_path(r'^categories/(?P<pk>[^/.]+)/$', views.category_detail, name='category-detail'),
    re_path(r'^tasks/(?P<task_id>[^/.]+)/subtasks/$', views.subtask_operations, name='subtask-operations'),
    re_path(r'^statistics/$', views.task_statistics, name='task-statistics'),
]