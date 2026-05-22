$dir = "c:\Users\USER\Documents\GABBY FILES\EYA MI AMOR\EYA CAPSTONE FILES\CAPSTONE PROJ SYSTEM\CoreFitness\g-fitness-member\src\pages"
$files = Get-ChildItem $dir -Filter "*.tsx"

foreach ($f in $files) {
    $c = Get-Content $f.FullName -Raw
    $c = $c -replace 'hover:shadow-orange-500/30', 'hover:shadow-yellow-500/30'
    $c = $c -replace 'hover:from-orange-600 hover:to-orange-500', 'hover:from-yellow-700 hover:to-yellow-500'
    $c = $c -replace 'border border-orange-500/20', 'border border-yellow-500/10'
    $c = $c -replace 'bg-orange-500/20', 'bg-yellow-500/10'
    $c = $c -replace 'from-orange-500/20', 'from-yellow-500/10'
    $c = $c -replace 'accent-orange-500', 'accent-yellow-500'
    $c = $c -replace 'from-orange-500 to-red-500', 'from-yellow-500 to-amber-600'
    $c = $c -replace 'from-yellow-500 to-orange-500', 'from-yellow-500 to-amber-500'
    $c = $c -replace 'from-amber-500 to-orange-500', 'from-amber-500 to-yellow-500'
    $c = $c -replace 'from-red-500 to-orange-500', 'from-red-500 to-amber-500'
    Set-Content $f.FullName -Value $c -NoNewline
}

Write-Host "Cleanup done!"
