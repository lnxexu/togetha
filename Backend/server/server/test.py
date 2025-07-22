from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth.models import User

class MyAPITest(TestCase):
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username='testuser',
            password='testpassword'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_get_my_data(self):
        # Replace 'my-data-list' with an existing URL name in your project
        url = reverse('home')  
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        # Add more assertions as needed