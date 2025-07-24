from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from .models import Task, TaskCategory
import uuid

class TaskManagerTests(TestCase):
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create a test category
        self.category = TaskCategory.objects.create(
            name='Test Category',
            user=self.user
        )
        
        # Create a test task
        self.task = Task.objects.create(
            text='Test Task',
            priority='high',
            user=self.user,
            category=self.category
        )
    
    def test_create_task(self):
        url = reverse('task-list')
        data = {
            'text': 'New Task',
            'priority': 'medium',
            'category': self.category.id
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['text'], 'New Task')
    
    def test_list_tasks(self):
        url = reverse('task-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
    
    def test_get_task_detail(self):
        url = reverse('task-detail', args=[self.task.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['text'], 'Test Task')
    
    def test_update_task(self):
        url = reverse('task-detail', args=[self.task.id])
        data = {'text': 'Updated Task'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['text'], 'Updated Task')
    
    def test_delete_task(self):
        url = reverse('task-detail', args=[self.task.id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Task.objects.count(), 0)
    
    def test_create_category(self):
        url = reverse('category-list')
        data = {'name': 'New Category', 'color': '#FF5733'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Category')
    
    def test_task_statistics(self):
        url = reverse('task-statistics')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_tasks'], 1)
        self.assertEqual(response.data['high_priority'], 1)