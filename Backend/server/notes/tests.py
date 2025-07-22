from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from rest_framework import status, permissions
from django.db import models

# Create notes app test case
class CreateNotesTest(TestCase):
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username='Kobe',
            password='Oliviahyejoo123@@'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_folder(self):
        url = reverse('folder-list')
        data = {'name': 'Test Folder'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Test Folder')
        
    def test_create_note(self):
        url = reverse('note-list')
        data = {
            'title': 'Test Note',
            'content': 'This is a test note.',
            'folder': None  # Assuming folder can be optional
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'Test Note')
        
    def get_all_folders(self):
        url = reverse('folder-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data
    
    def get_all_notes(self):
        url = reverse('note-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data
    
    def test_get_folders(self):
        folders = self.get_all_folders()
        self.assertIsInstance(folders, list)
        for folder in folders:
            self.assertIn('name', folder)
            self.assertIn('id', folder)
            self.assertEqual(folder['user'], self.user.id)


    