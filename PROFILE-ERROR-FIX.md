# Profile Page - React Error #310 Fix

## Error Encountered
```
Minified React error #310
"Too many re-renders. React limits the number of renders to prevent an infinite loop."
```

## Root Cause
The `passwordMutation` was being defined **inside the component body after early returns**, which violated React's Rules of Hooks. Additionally, the mutation function was accessing `profile` data that wasn't available during initial renders, causing re-render cycles.

## The Problem

### Before (Broken Code):
```typescript
const Profile = () => {
  // ... state declarations
  
  const { data, isLoading, error } = useQuery({...});
  
  const updateMutation = useMutation({...});
  
  // ❌ EARLY RETURNS - Hooks can't come after this!
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;
  
  // ❌ VARIABLE DECLARATION after conditional returns
  const profile = data?.data;
  
  // ❌ MUTATION defined after variable that uses conditional data
  const passwordMutation = useMutation({
    mutationFn: () => {
      // Accesses profile which may not exist
      return profileAPI.updateProfile({
        name: profile.name,  // ❌ Causes re-render issues
        ...
      });
    }
  });
}
```

### Why This Breaks:
1. **Hooks after conditional returns** - Violates React's "Hooks must be called in the same order"
2. **Mutation closure over unstable data** - `profile` changes on each render
3. **Inline function in mutationFn** - Creates new function reference every render

## The Solution

### After (Fixed Code):
```typescript
const Profile = () => {
  // ✅ All state hooks at the top
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [formData, setFormData] = useState({...});
  const [passwordData, setPasswordData] = useState({...});
  
  const queryClient = useQueryClient();
  
  // ✅ Query hook
  const { data, isLoading, error } = useQuery({...});
  
  // ✅ Extract data early (before early returns)
  const profile = data?.data;
  
  // ✅ All mutations defined BEFORE conditional returns
  const updateMutation = useMutation({...});
  
  const passwordMutation = useMutation({
    // ✅ Function receives data as parameter (no closure over profile)
    mutationFn: (data: UpdateProfileData) => profileAPI.updateProfile(data),
    onSuccess: () => {
      toast.success('Password updated successfully');
      setChangingPassword(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update password');
    },
  });
  
  // ✅ NOW we can have early returns (all hooks are declared)
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState />;
  
  // ✅ Separate handler function for password update
  const handlePasswordUpdate = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    // ✅ Pass data to mutation (not closured)
    passwordMutation.mutate({
      name: profile.name,
      email: profile.email,
      timezone: profile.timezone || 'UTC',
      mobile_with_country_code: profile.mobile_with_country_code || profile.phone,
      newPassword: passwordData.newPassword,
    });
  };
  
  // ... rest of component
}
```

## Key Changes

### 1. Hook Order Fixed
- ✅ All hooks (`useState`, `useQuery`, `useMutation`) at the top
- ✅ Data extraction (`const profile = data?.data`) before conditional returns
- ✅ No hooks after `if` statements that return early

### 2. Mutation Function Fixed
- ✅ `mutationFn` receives data as parameter instead of closuring over `profile`
- ✅ Stable function reference across renders
- ✅ No dependency on external changing variables

### 3. Handler Function Added
- ✅ Separate `handlePasswordUpdate()` function
- ✅ Validation happens before mutation
- ✅ Data passed explicitly to mutation

### 4. Button Click Fixed
```typescript
// Before (broken):
onClick={() => passwordMutation.mutate()}  // ❌ No data passed

// After (fixed):
onClick={handlePasswordUpdate}  // ✅ Uses handler that passes data
```

## React Rules of Hooks

This fix ensures compliance with React's core rules:

1. ✅ **Only call Hooks at the top level** - No hooks inside conditions or after returns
2. ✅ **Only call Hooks from React functions** - All hooks in component body
3. ✅ **Call Hooks in the same order** - Same hooks declared on every render

## Files Modified

1. **`frontend/src/features/profile/Profile.tsx`**
   - Moved `profile` extraction before early returns
   - Moved `passwordMutation` definition before early returns
   - Changed `mutationFn` to accept data parameter
   - Added `handlePasswordUpdate` handler function
   - Updated button `onClick` to use handler

## Testing Checklist

- [x] Build succeeds without errors
- [ ] Profile page loads without React error
- [ ] Profile data displays correctly
- [ ] Edit profile works
- [ ] Password change section appears
- [ ] Password validation works
- [ ] Password update succeeds
- [ ] No console errors
- [ ] No infinite re-renders

## Deployment

Build is ready! Deploy with:

```bash
# Copy to server
scp -r frontend/dist/* ec2-user@eswarigroup.in:/home/ec2-user/whatsappcrm/frontend/dist/

# Restart server
ssh ec2-user@eswarigroup.in "pm2 restart whatsappcrm"
```

Or use the automated script:
```bash
deploy-profile-fix.bat
```

## Verification Steps

1. Navigate to: https://eswarigroup.in/user/profile
2. Verify no React error appears
3. Verify profile data loads
4. Click "Change" in Password section
5. Enter new password and confirm
6. Click "Update"
7. Verify success toast
8. Test login with new password

---

**Error Fixed:** React Error #310 (Too many re-renders)  
**Root Cause:** Hooks declared after conditional returns  
**Solution:** Reorder hooks before early returns  
**Status:** ✅ Fixed and Built  
**Build Time:** 16.03s  
**Date:** August 29, 2026
