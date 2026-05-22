$dir = "c:\Users\USER\Documents\GABBY FILES\EYA MI AMOR\EYA CAPSTONE FILES\CAPSTONE PROJ SYSTEM\CoreFitness\g-fitness-member\src\pages"
$pages = @("Profile.tsx","Membership.tsx","Events.tsx","Workouts.tsx","Progress.tsx","ChatbotPage.tsx","BookClass.tsx","Trainers.tsx","BookingHistory.tsx","PaymentHistory.tsx","AttendanceHistory.tsx","EditProfile.tsx","RenewMembership.tsx","TrainerProfile.tsx","Register.tsx","GymDetail.tsx")

foreach ($f in $pages) {
    $path = Join-Path $dir $f
    if (Test-Path $path) {
        $c = Get-Content $path -Raw
        $c = $c -replace 'text-gray-400', 'text-white/40'
        $c = $c -replace 'text-gray-500', 'text-white/35'
        $c = $c -replace 'text-gray-300(?!/)', 'text-white/60'
        $c = $c -replace 'text-gray-600', 'text-white/25'
        $c = $c -replace 'text-orange-400', 'text-yellow-400'
        $c = $c -replace 'text-orange-300', 'text-yellow-300'
        $c = $c -replace 'text-orange-500', 'text-yellow-500'
        $c = $c -replace 'text-orange-200', 'text-yellow-200'
        $c = $c -replace 'border-orange-500/50', 'border-yellow-500/30'
        $c = $c -replace 'border-orange-500/30', 'border-yellow-500/20'
        $c = $c -replace 'border-orange-400/40', 'border-yellow-400/30'
        $c = $c -replace 'border-orange-500(?!/)', 'border-yellow-500'
        $c = $c -replace 'bg-orange-500/20', 'bg-yellow-500/10'
        $c = $c -replace 'bg-orange-500/10', 'bg-yellow-500/8'
        $c = $c -replace 'bg-orange-500/5', 'bg-yellow-500/5'
        $c = $c -replace 'from-orange-500 to-orange-400', 'from-yellow-600 to-yellow-400'
        $c = $c -replace 'from-orange-500 to-orange-600', 'from-yellow-500 to-yellow-600'
        $c = $c -replace 'from-orange-600 to-orange-700', 'from-yellow-600 to-yellow-700'
        $c = $c -replace 'fill-orange-400', 'fill-yellow-400'
        $c = $c -replace 'hover:text-orange-400', 'hover:text-yellow-400'
        $c = $c -replace 'hover:text-orange-300', 'hover:text-yellow-300'
        $c = $c -replace 'hover:border-orange-500', 'hover:border-yellow-500/40'
        $c = $c -replace 'placeholder-gray-600', 'placeholder-white/25'
        $c = $c -replace 'focus:border-orange-500', 'focus:border-yellow-500/50'
        $c = $c -replace "bg-gray-900 border border-gray-800 rounded-xl", "rounded-xl gold-input"
        $c = $c -replace "bg-gray-900 border border-gray-800 rounded-2xl", "glass-card rounded-2xl"
        $c = $c -replace "bg-gray-900 border-2 border-gray-800 rounded-2xl", "glass-card rounded-2xl"
        $c = $c -replace "bg-gray-800 border-2 border-gray-600 rounded-2xl", "glass-card rounded-2xl"
        $c = $c -replace "bg-dark-lighter border border-dark-border rounded-2xl", "glass-card rounded-2xl"
        $c = $c -replace "bg-dark-lighter border-2 border-dark-border rounded-2xl", "glass-card rounded-2xl"
        $c = $c -replace "bg-dark-lighter border-2 border-primary-start rounded-2xl", "glass-card gold-border-strong rounded-2xl"
        $c = $c -replace "bg-gray-800 border-2 border-gray-600 rounded-xl", "glass-card rounded-xl"
        $c = $c -replace "bg-dark-lighter border border-dark-border rounded-xl", "glass-card rounded-xl"
        $c = $c -replace "bg-gray-900 border border-gray-800 rounded-lg", "glass-card rounded-lg"
        $c = $c -replace 'hover:border-primary-start', 'hover:border-yellow-500/40'
        $c = $c -replace 'hover:bg-gray-700', ''
        $c = $c -replace "backgroundColor: '#0d0d0d'", "backgroundColor: '#050400'"
        $c = $c -replace "bg-gray-800 border border-gray-800", "glass-card"
        Set-Content $path -Value $c -NoNewline
        Write-Host "Updated: $f"
    } else {
        Write-Host "Not found: $f"
    }
}

# Also update Notifications component
$notifPath = "c:\Users\USER\Documents\GABBY FILES\EYA MI AMOR\EYA CAPSTONE FILES\CAPSTONE PROJ SYSTEM\CoreFitness\g-fitness-member\src\components\Notifications.tsx"
if (Test-Path $notifPath) {
    $c = Get-Content $notifPath -Raw
    $c = $c -replace 'text-gray-400', 'text-white/40'
    $c = $c -replace 'text-gray-300(?!/)', 'text-white/60'
    $c = $c -replace 'text-orange-400', 'text-yellow-400'
    $c = $c -replace 'bg-gray-800', 'bg-[rgba(10,8,0,0.85)]'
    $c = $c -replace 'border-gray-700', 'border-[rgba(246,201,14,0.12)]'
    $c = $c -replace 'bg-gray-900', 'bg-[rgba(10,8,0,0.65)]'
    Set-Content $notifPath -Value $c -NoNewline
    Write-Host "Updated: Notifications.tsx"
}

# Update AuthChoiceSheet
$authPath = "c:\Users\USER\Documents\GABBY FILES\EYA MI AMOR\EYA CAPSTONE FILES\CAPSTONE PROJ SYSTEM\CoreFitness\g-fitness-member\src\components\ui\AuthChoiceSheet.tsx"
if (Test-Path $authPath) {
    $c = Get-Content $authPath -Raw
    $c = $c -replace 'text-gray-400', 'text-white/40'
    $c = $c -replace 'text-orange-400', 'text-yellow-400'
    $c = $c -replace 'from-orange-500 to-orange-400', 'from-yellow-600 to-yellow-400'
    $c = $c -replace 'bg-gray-900', 'bg-[rgba(10,8,0,0.85)]'
    $c = $c -replace 'border-gray-700', 'border-[rgba(246,201,14,0.15)]'
    $c = $c -replace 'border-gray-800', 'border-[rgba(246,201,14,0.12)]'
    Set-Content $authPath -Value $c -NoNewline
    Write-Host "Updated: AuthChoiceSheet.tsx"
}

Write-Host "All done!"
