import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Difficulty, DietType, ExerciseCategory, FoodRole, MealType, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* Name|CATEGORY|muscles|equipment|DIFFICULTY|C(ompound)/I|restSec|kcal per min|joint stress|description|steps (;)|safety */
const EXERCISES = `
Barbell Bench Press|CHEST|chest,triceps,front delts|barbell,bench|INTERMEDIATE|C|150|6|shoulder,wrist|Flat barbell press, the classic horizontal push.|Lie on the bench with eyes under the bar;Lower the bar to mid-chest under control;Press up until arms are straight|Use a spotter or safety arms; keep wrists stacked over elbows.
Dumbbell Bench Press|CHEST|chest,triceps,front delts|dumbbell,bench|BEGINNER|C|120|5.5|shoulder|Horizontal press with a greater range of motion than the barbell.|Sit with dumbbells on thighs and lie back;Lower until elbows are just below the bench;Press up and slightly together|Do not bounce the weights; choose a load you control.
Incline Dumbbell Press|CHEST|upper chest,front delts,triceps|dumbbell,bench|INTERMEDIATE|I|90|5.5|shoulder|Press on a 30° incline to emphasise the upper chest.|Set the bench to about 30°;Lower with elbows ~45° from torso;Press up without locking out hard|Avoid a steep incline that shifts load to the shoulders.
Machine Chest Press|CHEST|chest,triceps|machine|BEGINNER|C|90|4.5|shoulder|Guided chest press, good for learning the movement.|Adjust the seat so handles are mid-chest;Press forward until arms are nearly straight;Return slowly|Keep shoulder blades pinned back.
Push-up|CHEST|chest,triceps,core|bodyweight|BEGINNER|C|60|7|wrist,shoulder|Bodyweight horizontal press with a plank body line.|Hands under shoulders, body in a straight line;Lower chest toward the floor;Press back up without sagging hips|Drop to knees or use an incline if form breaks down.
Incline Push-up|CHEST|chest,triceps|bodyweight|BEGINNER|C|60|5|wrist|An easier push-up with hands on a raised surface.|Place hands on a bench or counter;Keep body straight and lower chest to the edge;Press away|The higher the surface, the easier the movement.
Cable Chest Fly|CHEST|chest|cable|INTERMEDIATE|I|75|4|shoulder|Constant-tension chest isolation.|Set pulleys at shoulder height;Step forward with a slight elbow bend;Bring hands together in an arc|Do not let the cables pull the shoulders forward.
Dumbbell Fly|CHEST|chest|dumbbell,bench|INTERMEDIATE|I|75|4|shoulder|Chest isolation with dumbbells.|Lie back with arms above chest;Open arms in an arc with soft elbows;Squeeze back to the top|Use light weight; overstretching stresses the shoulder.
Pull-up|BACK|lats,biceps,upper back|pull-up bar|INTERMEDIATE|C|150|7|shoulder,elbow|Bodyweight vertical pull.|Hang with an overhand grip;Pull chest toward the bar;Lower under control|Use bands or negatives if you cannot do full reps.
Lat Pulldown|BACK|lats,biceps|machine|BEGINNER|C|90|4.5|shoulder|Machine vertical pull, a pull-up alternative.|Grip slightly wider than shoulders;Pull the bar to upper chest;Return with control|Do not lean back excessively or yank the bar.
Seated Cable Row|BACK|mid back,lats,biceps|cable|BEGINNER|C|90|4.5|lower_back|Horizontal cable pull.|Sit tall with a neutral spine;Pull handle to the lower ribs;Pause and return slowly|Do not round the lower back or swing the torso.
One-Arm Dumbbell Row|BACK|lats,mid back,biceps|dumbbell,bench|BEGINNER|C|75|5|lower_back|Unilateral row supported on a bench.|Support one hand and knee on the bench;Row the dumbbell to the hip;Lower fully|Keep the spine neutral.
Barbell Bent-Over Row|BACK|lats,mid back,rear delts|barbell|ADVANCED|C|120|6|lower_back|Heavy horizontal row.|Hinge to about 45° with a flat back;Row the bar to the lower ribs;Lower with control|Reduce load if your back rounds.
Deadlift|BACK|glutes,hamstrings,back|barbell|ADVANCED|C|180|8|lower_back,knee,hip|Full-body hinge lift from the floor.|Bar over mid-foot, hips hinged, back flat;Push the floor away as you stand;Lower by hinging back|Learn with light weight; avoid if you have a lower-back issue without professional advice.
Resistance Band Row|BACK|mid back,biceps|band|BEGINNER|C|60|3.5|none|Home-friendly seated band row.|Loop the band around your feet;Pull handles toward the ribs;Squeeze shoulder blades|Keep the chest tall.
Band Pull-Apart|BACK|rear delts,upper back|band|BEGINNER|I|45|3|none|Posture-friendly upper back exercise.|Hold the band at shoulder height;Pull apart until arms are out to the sides;Return slowly|Do not shrug.
Superman Hold|BACK|lower back,glutes|bodyweight|BEGINNER|I|45|3|lower_back|Prone back-extension hold.|Lie face down;Lift arms and legs slightly;Hold 2–3 seconds|Lift only slightly; stop if it pinches the lower back.
Overhead Press|SHOULDERS|shoulders,triceps,core|barbell|INTERMEDIATE|C|150|6|shoulder,lower_back|Standing barbell press.|Bar at collarbone, glutes tight;Press overhead and move head through;Lower to the collarbone|Do not over-arch the lower back.
Dumbbell Shoulder Press|SHOULDERS|shoulders,triceps|dumbbell,bench|BEGINNER|C|90|5|shoulder|Seated or standing dumbbell press.|Start with dumbbells at ear height;Press overhead until arms are straight;Lower with control|Stop if the shoulder pinches; lighten load.
Machine Shoulder Press|SHOULDERS|shoulders,triceps|machine|BEGINNER|C|90|4.5|shoulder|Guided overhead press.|Adjust the seat so handles start at ear level;Press up;Lower slowly|Keep ribs down.
Lateral Raise|SHOULDERS|side delts|dumbbell|BEGINNER|I|60|3.5|shoulder|Side delt isolation.|Slight elbow bend;Raise arms to shoulder height;Lower slowly|Use light weight; don't swing.
Face Pull|SHOULDERS|rear delts,upper back|cable|BEGINNER|I|60|3.5|none|Rear delt and posture exercise.|Set the rope at face height;Pull toward the face, elbows high;Return with control|Keep the load light.
Pike Push-up|SHOULDERS|shoulders,triceps|bodyweight|INTERMEDIATE|C|75|6|shoulder,wrist|Bodyweight vertical press.|Hips high in an inverted V;Bend elbows to lower the head;Press back up|Progress from an elevated-foot version slowly.
Barbell Curl|BICEPS|biceps|barbell|BEGINNER|I|75|4|elbow,wrist|Classic biceps builder.|Stand tall, elbows by your sides;Curl the bar up;Lower slowly|Do not swing the torso.
Dumbbell Bicep Curl|BICEPS|biceps|dumbbell|BEGINNER|I|60|4|elbow|Alternating or simultaneous curl.|Palms forward;Curl to shoulder height;Lower fully|Keep the elbows still.
Hammer Curl|BICEPS|biceps,forearms|dumbbell|BEGINNER|I|60|4|elbow|Neutral-grip curl.|Palms face each other;Curl up;Lower slowly|Avoid momentum.
Resistance Band Curl|BICEPS|biceps|band|BEGINNER|I|45|3|none|Home curl with a band.|Stand on the band;Curl handles to shoulders;Lower slowly|Check the band for wear.
Triceps Pushdown|TRICEPS|triceps|cable|BEGINNER|I|60|4|elbow|Cable triceps isolation.|Elbows pinned to your sides;Push down until arms are straight;Return slowly|Do not lean over the bar.
Overhead Dumbbell Triceps Extension|TRICEPS|triceps|dumbbell|INTERMEDIATE|I|75|4|elbow,shoulder|Long-head triceps stretch.|Hold one dumbbell overhead with both hands;Lower behind the head;Extend|Keep ribs down; use a manageable weight.
Bench Dip|TRICEPS|triceps,chest|bodyweight|INTERMEDIATE|C|60|5|shoulder,wrist,elbow|Bodyweight triceps exercise.|Hands on a bench behind you;Lower until elbows reach ~90°;Press up|Skip if shoulders feel pinched.
Close-Grip Push-up|TRICEPS|triceps,chest|bodyweight|INTERMEDIATE|C|60|6|wrist,elbow|Push-up variation with hands closer.|Hands under chest;Lower keeping elbows close;Press up|Use knees if needed.
Barbell Back Squat|LEGS|quads,glutes,hamstrings|barbell,rack|ADVANCED|C|180|8|knee,lower_back,hip|The primary loaded squat.|Bar on upper back, feet shoulder-width;Sit down and back to at least parallel;Drive up through mid-foot|Use safety arms and learn with light loads first.
Goblet Squat|LEGS|quads,glutes|dumbbell|BEGINNER|C|90|6|knee|Beginner-friendly loaded squat.|Hold a dumbbell at the chest;Squat down keeping the chest tall;Stand up|Keep knees tracking over toes.
Bodyweight Squat|LEGS|quads,glutes|bodyweight|BEGINNER|C|60|5|knee|Foundation squat pattern.|Feet shoulder-width;Sit hips back and down;Stand tall|Squat to a comfortable depth.
Leg Press|LEGS|quads,glutes|machine|BEGINNER|C|120|6|knee|Machine leg press.|Feet shoulder-width on the platform;Lower until knees ~90°;Press without locking knees|Don't let the lower back peel off the pad.
Walking Lunge|LEGS|quads,glutes,hamstrings|bodyweight|BEGINNER|C|75|6|knee,ankle|Dynamic lunge pattern.|Step forward and lower the back knee;Push through the front heel;Alternate legs|Take a longer step if the knee goes far past the toes.
Bulgarian Split Squat|LEGS|quads,glutes|dumbbell,bench|ADVANCED|C|90|6.5|knee,hip|Single-leg squat with rear foot elevated.|Rear foot on the bench;Lower straight down;Drive up through the front foot|Balance-heavy: start with bodyweight.
Romanian Deadlift|LEGS|hamstrings,glutes|barbell|INTERMEDIATE|C|120|6|lower_back|Hip-hinge for hamstrings.|Soft knees, bar close to legs;Hinge until hamstrings stretch;Stand by driving hips forward|Keep the back flat.
Dumbbell Romanian Deadlift|LEGS|hamstrings,glutes|dumbbell|BEGINNER|C|90|5.5|lower_back|Dumbbell hinge.|Dumbbells in front of thighs;Hinge back, spine neutral;Return by squeezing glutes|Stop the descent when your back would round.
Leg Curl|LEGS|hamstrings|machine|BEGINNER|I|60|3.5|knee|Machine hamstring isolation.|Pad above heels;Curl toward glutes;Lower slowly|Don't lift the hips.
Leg Extension|LEGS|quads|machine|BEGINNER|I|60|3.5|knee|Machine quad isolation.|Pad above the ankles;Extend until legs are straight;Lower slowly|Use moderate weight to keep knees comfortable.
Standing Calf Raise|LEGS|calves|bodyweight|BEGINNER|I|45|3|ankle|Basic calf raise.|Stand on the balls of your feet;Rise as high as possible;Lower slowly|Hold a wall for balance.
Glute Bridge|GLUTES|glutes,hamstrings|bodyweight|BEGINNER|I|45|3.5|none|Floor glute activation.|Lie back with knees bent;Drive hips up;Squeeze and lower|Avoid over-arching the back.
Barbell Hip Thrust|GLUTES|glutes,hamstrings|barbell,bench|INTERMEDIATE|C|90|6|hip|Loaded hip extension.|Upper back on the bench, bar over hips;Drive hips up until the body is level;Lower under control|Use a pad on the bar.
Single-Leg Glute Bridge|GLUTES|glutes|bodyweight|INTERMEDIATE|I|45|4|none|Unilateral glute bridge.|One leg extended;Drive up through the other heel;Lower slowly|Keep hips level.
Cable Glute Kickback|GLUTES|glutes|cable|INTERMEDIATE|I|60|4|hip|Cable glute isolation.|Ankle strap on;Kick back with a straight torso;Return slowly|Do not arch the back.
Banded Lateral Walk|GLUTES|glute medius|band|BEGINNER|I|45|3.5|none|Hip abductor activation.|Band above knees;Step sideways in a half squat;Keep tension|Keep toes forward.
Plank|CORE|core,shoulders|bodyweight|BEGINNER|I|45|3.5|none|Isometric core hold.|Forearms under shoulders;Body in a straight line;Hold and breathe|Stop if the lower back sags or hurts.
Dead Bug|CORE|deep core|bodyweight|BEGINNER|I|45|3|none|Controlled core pattern.|Arms up, knees at 90°;Lower opposite arm and leg;Return|Keep the lower back flat.
Bird Dog|CORE|core,glutes,lower back|bodyweight|BEGINNER|I|45|3|none|Stability drill.|Hands and knees;Extend opposite arm and leg;Hold and return|Move slowly.
Crunch|CORE|abs|bodyweight|BEGINNER|I|45|3|neck|Basic abdominal flexion.|Knees bent, hands by ears;Curl shoulders up;Lower|Don't pull on the neck.
Hanging Knee Raise|CORE|abs,hip flexors|pull-up bar|INTERMEDIATE|I|60|4|shoulder|Hanging core exercise.|Hang from the bar;Raise knees toward the chest;Lower slowly|Avoid swinging.
Russian Twist|CORE|obliques|bodyweight|BEGINNER|I|45|3.5|lower_back|Rotational core exercise.|Sit leaning back slightly;Rotate side to side;Keep chest tall|Skip if it aggravates the back.
Brisk Walking|CARDIO|full body|bodyweight|BEGINNER|I|0|4|none|Low-impact steady cardio.|Walk at a pace where talking is possible;Swing arms naturally;Keep posture tall|Wear supportive shoes.
Treadmill Jog|CARDIO|full body|treadmill|BEGINNER|I|0|9|knee,ankle|Steady jogging.|Start with 5 min walk;Jog at a conversational pace;Cool down|Reduce impact by walking on an incline.
Stationary Cycling|CARDIO|legs,cardio|bike|BEGINNER|I|0|7|none|Low-impact cardio.|Adjust the seat height;Pedal at steady effort;Keep a light grip|Seat height: slight knee bend at the bottom.
Jumping Jacks|CARDIO|full body|bodyweight|BEGINNER|I|30|8|knee,ankle|Simple aerobic warm-up.|Jump feet apart while raising arms;Return;Repeat rhythmically|Step-jacks are a low-impact alternative.
High Knees|CARDIO|legs,cardio|bodyweight|BEGINNER|I|30|8|knee,ankle|Running-in-place drill.|Drive knees to hip height;Pump arms;Stay on the balls of feet|Reduce speed if joints feel sore.
Mountain Climbers|CARDIO|core,shoulders,legs|bodyweight|INTERMEDIATE|I|30|8|wrist,shoulder|Plank-based cardio.|High plank;Alternate driving knees to chest;Keep hips low|Slow the pace to protect form.
Burpees|FULL_BODY|full body|bodyweight|ADVANCED|C|60|10|wrist,shoulder,knee,lower_back|High-intensity full-body drill.|Squat and place hands down;Jump feet back, optional push-up;Jump feet in and stand|Step instead of jump to scale down.
Kettlebell Swing|FULL_BODY|glutes,hamstrings,core|kettlebell|INTERMEDIATE|C|60|9|lower_back|Explosive hip hinge.|Hinge and hike the bell back;Snap hips forward;Let the bell float to chest height|Master the hinge with a deadlift first.
Dumbbell Thruster|FULL_BODY|legs,shoulders|dumbbell|INTERMEDIATE|C|75|9|knee,shoulder|Squat-to-press combo.|Hold dumbbells at shoulders;Squat;Stand and press overhead|Use light weight.
Cat-Cow|MOBILITY|spine|bodyweight|BEGINNER|I|0|2|none|Spinal mobility drill.|On hands and knees;Round then arch the back;Move with breath|Move within a comfortable range.
World's Greatest Stretch|MOBILITY|hips,thoracic spine|bodyweight|BEGINNER|I|0|3|none|Multi-joint mobility drill.|Lunge with hand inside the front foot;Rotate the chest up;Switch sides|Go only as far as feels comfortable.
Hamstring Stretch|STRETCHING|hamstrings|bodyweight|BEGINNER|I|0|2|none|Static hamstring stretch.|Extend one leg;Hinge forward with a flat back;Hold 30 seconds|Stretch to mild tension, not pain.
Child's Pose|STRETCHING|lats,lower back|bodyweight|BEGINNER|I|0|2|none|Relaxing back and lat stretch.|Kneel and sit toward heels;Reach arms forward;Breathe|Skip if kneeling hurts.
Doorway Chest Stretch|STRETCHING|chest,front delts|bodyweight|BEGINNER|I|0|2|none|Pectoral stretch.|Forearms on a doorframe;Step through gently;Hold 30 seconds|No sharp pain.
`.trim().split('\n');

/* Name|ROLE|DIET (VG vegan,V veg,E egg,N non-veg)|kcal|P|C|F|fiber|allergens|meals (B,L,S,D)|serving g|serving label  — per 100 g */
const FOODS = `
Paneer|PROTEIN|V|265|18.3|1.2|20.8|0|milk|B,L,D|100|1 small bowl
Tofu (firm)|PROTEIN|VG|144|15.7|2.8|8.7|2.3|soy|B,L,D|100|100 g
Soya chunks (dry weight)|PROTEIN|VG|345|52|33|0.5|13|soy|L,D|30|1 handful
Moong dal (cooked)|PROTEIN|VG|105|7|19|0.4|7.6||L,D|150|1 katori
Toor dal (cooked)|PROTEIN|VG|110|7|17|1.5|3||L,D|150|1 katori
Rajma (cooked)|PROTEIN|VG|127|8.7|22.8|0.5|6.4||L,D|150|1 katori
Chole / chickpeas (cooked)|PROTEIN|VG|164|8.9|27.4|2.6|7.6||L,S,D|150|1 katori
Sprouts salad (moong)|PROTEIN|VG|30|3|6|0.2|1.8||B,L,S|100|1 bowl
Besan chilla|PROTEIN|VG|190|9|24|6|4||B|80|1 chilla
Egg (boiled)|PROTEIN|E|155|13|1.1|11|0|egg|B,S,D|50|1 egg
Egg omelette|PROTEIN|E|154|11|1|12|0|egg|B|100|2-egg omelette
Egg whites|PROTEIN|E|52|11|0.7|0.2|0|egg|B|33|1 white
Chicken breast (grilled)|PROTEIN|N|165|31|0|3.6|0||L,D|100|100 g
Chicken curry|PROTEIN|N|150|14|4|9|1||L,D|150|1 katori
Fish (rohu, grilled)|PROTEIN|N|140|24|0|4|0|fish|L,D|100|1 fillet
Whey protein powder|PROTEIN|V|400|80|8|6|0|milk|B,S|30|1 scoop
Plant protein powder|PROTEIN|VG|380|75|10|6|3||B,S|30|1 scoop
Curd (dahi)|DAIRY|V|61|3.5|4.7|3.3|0|milk|B,L,S,D|150|1 katori
Milk (toned)|DAIRY|V|58|3.1|4.7|3|0|milk|B,S|200|1 glass
Buttermilk (chaas)|DAIRY|V|40|3.3|4.8|0.9|0|milk|L,S|200|1 glass
Soy milk (unsweetened)|DAIRY|VG|33|2.8|1.2|1.6|0.4|soy|B,S|200|1 glass
White rice (cooked)|CARB|VG|130|2.7|28|0.3|0.4||L,D|150|1 katori
Brown rice (cooked)|CARB|VG|112|2.6|23.5|0.9|1.8||L,D|150|1 katori
Roti (whole wheat)|CARB|VG|297|9.6|46|7.5|4|gluten|B,L,D|40|1 roti
Paratha (plain)|CARB|VG|320|7|44|13|3|gluten|B|80|1 paratha
Poha|CARB|VG|130|2.6|24|2.7|1.2||B|150|1 plate
Upma|CARB|VG|130|3|20|4.5|1.5|gluten|B|150|1 plate
Oats (dry)|CARB|VG|389|16.9|66|6.9|10.6|gluten|B,S|40|½ cup
Idli|CARB|VG|130|4|26|0.4|1||B|40|1 idli
Dosa (plain)|CARB|VG|168|3.9|29|3.7|1||B|80|1 dosa
Vegetable khichdi|CARB|VG|115|4.5|19|2.5|2||L,D|200|1 bowl
Quinoa (cooked)|CARB|VG|120|4.4|21|1.9|2.8||L,D|150|1 katori
Sweet potato (boiled)|CARB|VG|86|1.6|20|0.1|3||B,S,L|150|1 medium
Multigrain bread|CARB|VG|250|10|43|4|6|gluten|B|30|1 slice
Mixed vegetable sabzi|VEGETABLE|VG|70|2|9|3|3||L,D|150|1 katori
Palak (spinach) sabzi|VEGETABLE|VG|60|3|5|3.5|2||L,D|150|1 katori
Bhindi sabzi|VEGETABLE|VG|80|2|8|4.5|3||L,D|150|1 katori
French beans sabzi|VEGETABLE|VG|65|2|8|3|3||L,D|150|1 katori
Cauliflower (gobi) sabzi|VEGETABLE|VG|70|2.5|7|3.5|2.5||L,D|150|1 katori
Cucumber-tomato salad|VEGETABLE|VG|15|0.7|3.6|0.1|0.5||L,S,D|150|1 bowl
Sambar|VEGETABLE|VG|60|3|9|1.5|2||B,L|150|1 katori
Banana|FRUIT|VG|89|1.1|23|0.3|2.6||B,S|120|1 medium
Apple|FRUIT|VG|52|0.3|14|0.2|2.4||B,S|150|1 medium
Papaya|FRUIT|VG|43|0.5|11|0.3|1.7||B,S|150|1 bowl
Orange|FRUIT|VG|47|0.9|12|0.1|2.4||B,S|130|1 medium
Guava|FRUIT|VG|68|2.6|14|1|5.4||B,S|100|1 medium
Almonds|SNACK|VG|579|21|22|50|12|tree_nut|S|25|~20 almonds
Roasted peanuts|SNACK|VG|567|26|16|49|8.5|peanut|S|30|1 handful
Roasted chana|SNACK|VG|364|19|61|6|17||S|40|1 handful
Makhana (roasted)|SNACK|VG|347|9.7|77|0.1|14.5||S|30|1 bowl
Peanut butter|SNACK|VG|588|25|20|50|6|peanut|S|20|1 tbsp+
Ghee|FAT|V|900|0|0|100|0|milk|L,D|5|1 tsp
`.trim().split('\n');

const DIET: Record<string, DietType> = { VG: 'VEGAN', V: 'VEGETARIAN', E: 'EGGETARIAN', N: 'NON_VEGETARIAN' };
const MEAL: Record<string, MealType> = { B: 'BREAKFAST', L: 'LUNCH', S: 'SNACK', D: 'DINNER' };
const csv = (s: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

async function main() {
  for (const line of EXERCISES) {
    const [name, category, muscles, equipment, difficulty, kind, rest, kcal, stress, description, steps, safety] = line.split('|');
    const compound = kind === 'C';
    const cardio = category === 'CARDIO' || category === 'MOBILITY' || category === 'STRETCHING';
    const data = {
      name, description, category: category as ExerciseCategory, muscleGroups: csv(muscles), equipment: csv(equipment),
      difficulty: difficulty as Difficulty, isCompound: compound, instructions: steps.split(';'),
      defaultSets: cardio ? 1 : compound ? 4 : 3, repMin: compound ? 6 : 10, repMax: compound ? 10 : 15,
      restSec: Number(rest), caloriesPerMin: Number(kcal), safetyNotes: safety,
      jointStress: csv(stress).filter((s) => s !== 'none'),
    };
    await prisma.exercise.upsert({ where: { name }, create: data, update: data });
  }
  await prisma.food.deleteMany({ where: { createdById: null } });
  await prisma.food.createMany({
    data: FOODS.map((line) => {
      const [name, role, diet, kcal, p, c, f, fiber, allergens, meals, serving, label] = line.split('|');
      return {
        name, category: role as FoodRole, dietType: DIET[diet], calories: +kcal, protein: +p, carbs: +c, fat: +f, fiber: +fiber,
        allergens: csv(allergens), mealTypes: csv(meals).map((m) => MEAL[m]), servingG: +serving, servingLabel: label, isIndian: true,
      };
    }),
  });

  const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  await prisma.user.upsert({
    where: { email: 'admin@fitai.local' },
    create: { email: 'admin@fitai.local', name: 'FitAI Admin', role: 'ADMIN', passwordHash: await bcrypt.hash(adminPass, 12), subscription: { create: {} } },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'trainer@fitai.local' },
    create: { email: 'trainer@fitai.local', name: 'Demo Trainer', role: 'TRAINER', passwordHash: await bcrypt.hash(adminPass, 12), subscription: { create: {} } },
    update: {},
  });
  // eslint-disable-next-line no-console
  console.log(`Seeded ${EXERCISES.length} exercises, ${FOODS.length} foods, admin + trainer users (password from SEED_ADMIN_PASSWORD or default).`);
}

main().finally(() => prisma.$disconnect());
