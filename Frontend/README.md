# FrontEnd
___________________________________________________________________________________________

## Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

___________________________________________________________________________________________

# Backend

## How to Activate your Virtual Environment on to your Computer

1. Open your Command Prompt from the Start button. Make sure your command prompt is in Administrator Mode.
2. Go to the Project's Directory.
3. After changing the directory, kindly follow this line of commands in order:
    - python -m venv "nameOfYourEnvironment" (e.g. python -m venv myEnv)
    - Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    - "nameOfYourEnvironment"\Scripts\Activate 

You should see "(venv) C:path\to\the\project\togetha>" by now. Well congratulations on making your 1st Virtual Environment. Do not exit your current Command Prompt as it will be used for running the Backend of this project.
___________________________________________________________________________________________

## How to Run the Backend of this project

1. Install the latest pip version by typing "pip install --upgrade"
2. Kindly follow this line of commands in order:
    - pip install django
    - pip install djangorestframework
    - pip install django-rest-authtoken
    - pip install djangorestframework django-cors-headers
3. Change the directory by typing "cd Backend/server"
4. Type "python manage.py migrate" in order to update those pending migrations.
5. Lastly type "python manage.py runserver" to run the entire server. 

Now you can call a requests from the project's Frontend to the project's Backend. Have fun using our project!
___________________________________________________________________________________________

## How to check the database of this project

1. Download DB Browser on your computer.
    - https://sqlitebrowser.org/dl/
2. Setup the DB Browser.
3. Look for the tab that says "Open Database"
4. Look for the path of the project and go the Backend folder and proceed to the server folder and another server folder and kindly choose the name "db.sqlite3".


