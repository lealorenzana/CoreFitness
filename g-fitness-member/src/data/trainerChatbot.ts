/**
 * Trainer Chatbot Responses
 * AI assistant responses for trainers
 */

export const TRAINER_CHATBOT_RESPONSES: Record<string, string> = {
  // Member Management
  'member': `**Managing Members:**

• View all assigned members in the Members tab
• Track their progress and attendance
• Add workout recommendations
• Provide feedback and evaluations
• Monitor their goals and achievements

Tap on any member to see detailed information and add personalized recommendations.`,

  'assign': `**Member Assignments:**

Members are assigned to you by the gym administrator. You'll receive a notification when a new member is assigned to your training group.

You can view all your assigned members in the Members tab and track their progress individually.`,

  'progress': `**Tracking Member Progress:**

1. Go to Members tab
2. Select a member
3. View their:
   • Body measurements
   • Workout history
   • Attendance record
   • Goals and achievements
   • Progress photos

You can add feedback and recommendations to help them improve!`,

  // Workout Planning
  'workout': `**Creating Workout Plans:**

**For Individual Members:**
1. Go to Members tab
2. Select a member
3. Tap "Add Recommendation"
4. Choose workout type and add details

**Best Practices:**
• Assess current fitness level
• Set realistic goals
• Progressive overload
• Include rest days
• Mix cardio and strength training`,

  'plan': `**Workout Planning Tips:**

**Beginner:** Focus on form, compound movements, 3x/week
**Intermediate:** Increase volume, add variations, 4-5x/week
**Advanced:** Periodization, specialized training, 5-6x/week

Always consider:
• Member's goals
• Current fitness level
• Available equipment
• Time constraints
• Injury history`,

  'exercise': `**Exercise Recommendations:**

**Strength:**
• Squats, Deadlifts, Bench Press
• Rows, Pull-ups, Overhead Press
• Lunges, Romanian Deadlifts

**Cardio:**
• HIIT intervals
• Steady-state cardio
• Circuit training

**Flexibility:**
• Dynamic stretching (warm-up)
• Static stretching (cool-down)
• Yoga and mobility work`,

  // Scheduling
  'schedule': `**Managing Your Schedule:**

**Set Availability:**
1. Go to Schedule tab
2. Toggle days you're available
3. System shows your assigned classes

**View Classes:**
• See all upcoming sessions
• Filter by date
• Check member attendance

Your schedule updates automatically when bookings are confirmed!`,

  'availability': `**Setting Availability:**

1. Open Schedule tab
2. Toggle each day (Mon-Sun)
3. Green = Available
4. Gray = Unavailable

Members can only book sessions on days you're available. Update your availability regularly to manage your workload.`,

  'class': `**Class Management:**

**Your Classes:**
• View in Schedule tab
• See enrolled members
• Check time and location
• Track attendance

**Session Types:**
• Personal Training (1-on-1)
• Group Classes (multiple members)
• Specialized sessions (HIIT, Yoga, etc.)`,

  // Bookings
  'booking': `**Managing Bookings:**

**Pending Requests:**
1. Go to Bookings tab
2. Review pending requests
3. Accept or Decline
4. Add notes if needed

**Tips:**
• Respond within 24 hours
• Check your availability first
• Communicate clearly
• Confirm session details`,

  'accept': `**Accepting Bookings:**

When you accept a booking:
• Member receives confirmation
• Session added to your schedule
• Reminder sent before session
• Member can view in their app

Always verify the date, time, and session type before accepting!`,

  'decline': `**Declining Bookings:**

If you need to decline:
1. Select the booking
2. Tap "Decline"
3. Add a reason (optional)
4. Member receives notification

**Valid Reasons:**
• Schedule conflict
• Already fully booked
• Need more preparation time
• Member needs different trainer`,

  // Feedback & Evaluation
  'feedback': `**Providing Feedback:**

**How to Add Feedback:**
1. Go to Members tab
2. Select a member
3. Tap "Add Feedback"
4. Choose feedback type:
   • Recommendation
   • Performance comment
   • Improvement suggestion
   • Workout plan

**Best Practices:**
• Be specific and constructive
• Focus on progress
• Set clear next steps
• Encourage and motivate`,

  'evaluation': `**Member Evaluations:**

**What to Include:**
• Current performance level
• Strengths and improvements
• Areas needing work
• Recommended exercises
• Goal progress assessment

**Frequency:**
• Weekly check-ins
• Monthly progress reviews
• Quarterly assessments

Regular feedback keeps members motivated and on track!`,

  'recommendation': `**Workout Recommendations:**

**Structure:**
1. Assessment of current level
2. Specific exercises
3. Sets, reps, and rest periods
4. Progression plan
5. Safety notes

**Example:**
"Great progress on squats! Let's increase weight by 5kg next session. Focus on depth and form. Add 3x8 Bulgarian split squats for leg balance."`,

  // Training Tips
  'form': `**Teaching Proper Form:**

**Key Points:**
• Demonstrate first
• Watch and correct
• Use cues (verbal + visual)
• Start with lighter weight
• Progress gradually

**Common Mistakes:**
• Rushing through reps
• Poor posture
• Incorrect breathing
• Skipping warm-up
• Ego lifting`,

  'motivation': `**Motivating Members:**

**Strategies:**
• Set achievable goals
• Celebrate small wins
• Track progress visually
• Create friendly competition
• Share success stories
• Be enthusiastic and positive

**When Members Struggle:**
• Listen to their concerns
• Adjust expectations
• Break goals into smaller steps
• Remind them of past progress`,

  'nutrition': `**Nutrition Guidance:**

**General Tips:**
• Protein: 1.6-2.2g per kg body weight
• Hydration: 2-3 liters daily
• Pre-workout: Carbs + protein (1-2h before)
• Post-workout: Protein + carbs (within 1h)

**Note:** For detailed nutrition plans, recommend consulting a registered dietitian.`,

  // Performance
  'rating': `**Your Performance Rating:**

Your rating is based on:
• Member feedback (anonymous)
• Session completion rate
• Member progress
• Professionalism

**Improve Your Rating:**
• Be punctual
• Communicate clearly
• Personalize workouts
• Show genuine care
• Follow up regularly

Check your rating in the Profile tab!`,

  'stats': `**Your Statistics:**

**View in Profile Tab:**
• Total sessions completed
• Assigned members count
• Average rating
• Member retention rate

**Track Your Growth:**
• Weekly session count
• Member progress metrics
• Feedback received
• Achievement milestones`,

  // System Help
  'help': `**Need Help?**

**Common Tasks:**
• "How do I manage members?"
• "How do I create workout plans?"
• "How do I set my schedule?"
• "How do I handle bookings?"
• "How do I give feedback?"

**Contact Support:**
If you need technical help, contact the gym administrator or use the support option in Settings.`,

  'notification': `**Notifications:**

You'll receive notifications for:
• New booking requests
• Member assignments
• Schedule reminders
• Rating milestones
• System updates

Manage notification settings in your Profile → Settings.`,

  'profile': `**Your Profile:**

**Update Your Profile:**
1. Go to Profile tab
2. Edit your information
3. Update bio and specialization
4. Add certifications
5. Upload profile photo

A complete profile helps members choose the right trainer!`,
};
