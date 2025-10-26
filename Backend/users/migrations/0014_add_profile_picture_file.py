"""Add ImageField profile_picture_file to UserProfile."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0013_remove_userprofile_profile_picture_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="profile_picture_file",
            field=models.ImageField(upload_to="profiles/", null=True, blank=True),
        ),
    ]
