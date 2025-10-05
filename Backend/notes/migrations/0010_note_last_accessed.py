from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notes', '0009_alter_note_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='note',
            name='last_accessed',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AlterModelOptions(
            name='note',
            options={'ordering': ['-last_accessed', '-updated_at']},
        ),
    ]
