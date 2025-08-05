# Profile Feature Documentation

## Overview
The Profile feature provides users with a comprehensive dashboard to view their progress and manage their account. It's now organized into three main components for better user experience and functionality separation.

## Features

### Main Profile Page (`Profile.tsx`)
- **Header Section**:
  - Settings title at the top
  - Logout button on the right side
  - User profile picture (circular, with default avatar if no image)
  - Username, email, and join date display
  - Edit profile button (pen icon) - redirects to EditProfile

- **Progress Dashboard**:
  - Tasks Completed counter
  - Notes Created counter  
  - Study Streak tracker
  - Learning Hours display
  - Each metric shows current values with descriptive icons and colors

- **Quick Actions**:
  - "My Profile" card that navigates to ManageProfile for comprehensive account management

### Edit Profile Page (`EditProfile.tsx`)
- **Header**:
  - Back navigation button
  - "Edit Profile" title
  - Edit/Save toggle button

- **Profile Picture Section**:
  - Large circular profile picture display
  - Change picture button (when in edit mode)

- **Editable Form Fields**:
  - Full Name
  - Email
  - Phone Number
  - Location
  - Bio (multi-line text area)
  - Save/Cancel action buttons when editing

### Manage Profile Page (`ManageProfile.tsx`)
- **Header**:
  - Back navigation button
  - "My Profile" title

- **Profile Summary**:
  - Compact profile display with picture, name, email, and join date

- **Profile Management**:
  - Edit Profile (navigates to EditProfile)
  - Change Profile Picture

- **Account Settings**:
  - Notifications
  - Privacy & Security
  - Change Password

- **App Settings**:
  - Language
  - Theme
  - Clear Cache

- **Data & Support**:
  - Export Data
  - Help & Support
  - About

- **Danger Zone**:
  - Delete Account (highlighted as dangerous action)

## Navigation Flow
1. **Profile** (main) → **ManageProfile** (settings hub) → **EditProfile** (editing)
2. **Profile** → **EditProfile** (quick edit via pen icon)
3. Users can navigate back through the hierarchy

## Data Management

### User Service (`userService.ts`)
- Persistent data storage using AsyncStorage
- Default user profile creation
- Profile update functionality
- Statistics tracking (tasks, notes, study streak, learning hours)
- Data export and deletion capabilities

### User Profile Interface
```typescript
interface UserProfile {
    id: string;
    name: string;
    email: string;
    bio?: string;
    phone?: string;
    location?: string;
    profilePicture?: string;
    joinDate: string;
    tasksCompleted: number;
    notesCreated: number;
    studyStreak: number;
    learningHours: number;
}
```

## Navigation Integration
- Added to main navigation stack as "Profile", "ManageProfile", and "EditProfile"
- Integrated with bottom navigation bar
- Proper navigation flow between all profile views

## Usage
1. Users access the profile from the bottom navigation
2. View their learning progress and statistics on the main Profile page
3. Click "My Profile" for comprehensive account management (ManageProfile)
4. Click "Edit Profile" or the pen icon for quick profile editing (EditProfile)
5. Access all account settings, app preferences, and data management options
6. Logout from the main Profile page

## Styling
- Consistent with app design system using purple color scheme (#6A009C)
- Responsive design with proper spacing and shadows
- Loading states for better user experience
- Form validation and error handling
- Organized settings sections with clear visual hierarchy

## Component Organization
- **Profile.tsx**: Main dashboard and progress view
- **EditProfile.tsx**: Focused profile information editing
- **ManageProfile.tsx**: Comprehensive settings and account management hub
- **userService.ts**: Data management and persistence
- **index.ts**: Component exports

## Future Enhancements
- Image picker implementation for profile pictures
- Push notification settings with toggles
- Privacy controls with granular permissions
- Data export functionality (CSV/JSON)
- Account deletion with proper confirmation flow
- Social features integration
- Theme switching implementation
- Language localization support
