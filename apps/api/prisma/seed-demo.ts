/**
 * Demo data seed.
 *
 * Creates 20 students, a small staff team, and 60 unique reports:
 *   • 40 completed reports (RESOLVED / CLOSED) with replies, history and feedback
 *   • 20 open reports across every stage of the workflow
 *
 * Safe to run repeatedly: users are upserted by email and reports are skipped
 * when their reference number already exists. Run `npm run seed` first so the
 * departments, categories and roles exist.
 */
import { PrismaClient, type TicketPriority, type TicketStatus } from '@prisma/client';
import { formatReference } from '@campus-resolve/shared';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

const STUDENT_PASSWORD = 'Student!2026';
const STAFF_PASSWORD = 'Officer!2026';
const DOMAIN = 'live.gctu.edu.gh';

const STUDENT_NAMES = [
  'Ama Serwaa Boateng',
  'Kwabena Osei Mensah',
  'Efua Adjeiwaa Larbi',
  'Yaw Nana Bediako',
  'Akosua Frimpongmaa Danso',
  'Kojo Amankwah Owusu',
  'Abena Nyarko Asante',
  'Kofi Anane Appiah',
  'Adwoa Pokuaa Sarpong',
  'Kwesi Manu Addo',
  'Esi Ama Quansah',
  'Nii Armah Tetteh',
  'Afia Konadu Boadu',
  'Fiifi Essuman Acquah',
  'Maame Yaa Serwah',
  'Nana Kweku Asare',
  'Araba Ekua Mensimah',
  'Selorm Kofi Agbeko',
  'Dzifa Elorm Amuzu',
  'Ato Kwamena Baiden',
];

const OFFICERS = [
  {
    fullName: 'Efua Mensah',
    email: `officer.acad@${DOMAIN}`,
    code: 'ACAD',
    role: 'OFFICER' as const,
  },
  {
    fullName: 'Kwame Boateng',
    email: `officer.reg@${DOMAIN}`,
    code: 'REG',
    role: 'OFFICER' as const,
  },
  {
    fullName: 'Adjoa Owusu',
    email: `officer.fin@${DOMAIN}`,
    code: 'FIN',
    role: 'OFFICER' as const,
  },
  {
    fullName: 'Yaw Antwi',
    email: `officer.stuad@${DOMAIN}`,
    code: 'STUAD',
    role: 'OFFICER' as const,
  },
  {
    fullName: 'Akosua Danso',
    email: `officer.ict@${DOMAIN}`,
    code: 'ICT',
    role: 'OFFICER' as const,
  },
  {
    fullName: 'Kofi Asare',
    email: `officer.admin@${DOMAIN}`,
    code: 'ADMIN',
    role: 'OFFICER' as const,
  },
  {
    fullName: 'Dr. Nana Yeboah',
    email: `head.acad@${DOMAIN}`,
    code: 'ACAD',
    role: 'DEPARTMENT_HEAD' as const,
  },
  {
    fullName: 'Grace Amoako',
    email: `head.reg@${DOMAIN}`,
    code: 'REG',
    role: 'DEPARTMENT_HEAD' as const,
  },
];

interface Scenario {
  category: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  /** Present on completed reports. */
  resolution?: string;
  rating?: number;
  feedback?: string;
  /** Only used by open reports. */
  status?: TicketStatus;
}

/* -------------------------------------------------------------------------- */
/* 40 completed reports                                                       */
/* -------------------------------------------------------------------------- */

const DONE_SCENARIOS: Scenario[] = [
  {
    category: 'Missing Examination Results',
    subject: 'CSC 305 result missing from my first semester transcript',
    description:
      'I sat the CSC 305 end-of-semester examination in the first semester and my continuous assessment was 28/30, but the result column on my transcript is blank. My index number is correct on the attendance sheet. I need the result before the departmental review on Friday.',
    priority: 'HIGH',
    resolution:
      'The examinations board confirmed that your CSC 305 script was scanned under the wrong index number. The script was re-linked to your record, the result was published as 72 (A), and your transcript has been regenerated.',
    rating: 5,
    feedback: 'The correction was fast and the new transcript was ready the same afternoon.',
  },
  {
    category: 'Incorrect Grade',
    subject: 'Recorded grade for MTH 201 does not match my script',
    description:
      'My MTH 201 grade shows a C on the portal, but the marked script returned to me shows 68, which should be a B. The mid-semester and end-of-semester marks were both above 60. Please review the grade entry.',
    priority: 'NORMAL',
    resolution:
      'The course lecturer confirmed a transcription error in the grade sheet. The mark was verified at 68 and the grade changed from C to B on your academic record.',
    rating: 5,
    feedback: 'Thank you for taking the time to check the original mark sheet.',
  },
  {
    category: 'GPA or CGPA Discrepancy',
    subject: 'CGPA dropped after a repeated course replaced the original grade',
    description:
      'After repeating ACC 205 and passing it, my CGPA fell from 3.21 to 2.94 instead of improving. I believe both attempts are being counted. I have attached the two result slips for comparison.',
    priority: 'HIGH',
    resolution:
      'Both attempts had been included in the CGPA calculation. The first attempt was excluded as a repeat, the calculation was rerun, and your CGPA now correctly reads 3.26.',
    rating: 5,
    feedback: 'The explanation of how repeats are calculated was helpful too.',
  },
  {
    category: 'Transcript Request or Discrepancy',
    subject: 'Graduate school transcript is missing two second-year courses',
    description:
      'The transcript I paid for and collected last week omits BAF 210 and BAF 220, although both appear on my student portal results page. The application deadline for my master’s programme is 30 days away.',
    priority: 'URGENT',
    resolution:
      'A batch printing fault dropped two course rows from the transcript template. The affected page was regenerated with BAF 210 and BAF 220 included, and a corrected sealed copy was issued at no extra cost.',
    rating: 4,
    feedback: 'The corrected transcript arrived in time, though I wish the first copy had been checked.',
  },
  {
    category: 'Incorrect Academic Records',
    subject: 'Wrong programme title appears on my academic record',
    description:
      'My record shows “BSc Information Technology” but I am enrolled in “BSc Computer Science”. This wrong title also appears on my student status letter and is affecting an internship application.',
    priority: 'NORMAL',
    resolution:
      'The programme mapping on your enrolment record was corrected to BSc Computer Science. A fresh student status letter reflecting the correct programme was issued and sent to your student email.',
    rating: 5,
    feedback: 'All the documents now match my admission letter.',
  },
  {
    category: 'Missing Examination Results',
    subject: 'No result showing for FRE 102 although I sat the paper',
    description:
      'FRE 102 is still showing “result pending” two months after the examination. I attended every lecture and my name appeared on the examination attendance sheet. I need the result to confirm my elective choice for next semester.',
    priority: 'NORMAL',
    resolution:
      'The French section had not submitted the final mark sheet for your group. The sheet was received, your score of 65 was entered, and the result is now visible on the portal.',
    rating: 4,
    feedback: 'Slow start, but once the department picked it up it was sorted quickly.',
  },
  {
    category: 'Incorrect Grade',
    subject: 'MTH 101 grade recorded as F after a successful resit',
    description:
      'I resat MTH 101 in the resit window and the resit result slip shows 58. The portal still shows the original F and my registration for MTH 201 is blocked as a result.',
    priority: 'HIGH',
    resolution:
      'The resit result had been received but not merged with the original record. The resit mark of 58 was applied, the F was replaced, and the MTH 201 prerequisite block was lifted.',
    rating: 5,
    feedback: 'The prerequisite was cleared before registration closed. Very relieved.',
  },
  {
    category: 'GPA or CGPA Discrepancy',
    subject: 'Semester GPA shows 2.85 but my four courses average 3.18',
    description:
      'I calculated my semester GPA from the four published course grades and it comes to 3.18, not the 2.85 shown on the portal. One of the courses is a 2-credit course, which I have accounted for.',
    priority: 'NORMAL',
    resolution:
      'A 3-credit course had been entered with a weight of 1 credit. After correcting the credit weighting, the semester GPA was recalculated to 3.18 and the CGPA updated accordingly.',
    rating: 5,
    feedback: 'The breakdown of credit weights made the correction easy to verify.',
  },
  {
    category: 'Course Registration Problem',
    subject: 'Cannot register for Level 400 electives after add/drop opened',
    description:
      'The portal accepts my elective choices but returns “registration window closed” when I confirm. The add/drop window is open until Friday and other students in my class have registered successfully.',
    priority: 'HIGH',
    resolution:
      'Your registration window was tied to the old Level 300 cohort. The window was updated to the Level 400 add/drop dates and you successfully registered for all three electives.',
    rating: 5,
    feedback: 'Registered the same day. The confirmation slip is in my portal.',
  },
  {
    category: 'Missing Registered Course',
    subject: 'Registered ENT 301 but it is missing from my timetable',
    description:
      'ENT 301 appears in my registered courses and I have been attending lectures, but it does not appear on my examination timetable. I am worried I will not be scheduled for the paper.',
    priority: 'HIGH',
    resolution:
      'The course had been registered against a discontinued timetable group. You were moved to the active group, ENT 301 now appears on your timetable and your examination entry has been confirmed.',
    rating: 5,
    feedback: 'The examination entry shows up correctly now.',
  },
  {
    category: 'Examination Eligibility',
    subject: 'Marked ineligible for exams because of an outstanding registration fee',
    description:
      'The eligibility list says I have an outstanding registration fee, but I paid GHS 120 at the bank and have the slip. I need the hold removed before the examination week begins.',
    priority: 'URGENT',
    resolution:
      'The bank slip had been posted to the wrong student account. The payment was traced and transferred to your record, the eligibility hold was removed and your examination entry is confirmed.',
    rating: 5,
    feedback: 'Thank you for tracing the payment before the first paper.',
  },
  {
    category: 'Examination Timetable Issue',
    subject: 'Two examination papers scheduled at the same time',
    description:
      'BAF 302 and ECO 204 are both scheduled for Tuesday at 9:00 in different halls. I registered for both courses and cannot sit two papers simultaneously. Please advise on the makeup arrangement.',
    priority: 'HIGH',
    resolution:
      'The clash was confirmed and a makeup sitting was arranged for ECO 204 on the following Saturday. Both entries remain valid and the examination office has informed both invigilators.',
    rating: 4,
    feedback: 'The makeup date was communicated clearly, though I only found the clash myself.',
  },
  {
    category: 'Student Portal Registration Error',
    subject: 'Portal throws an error when I confirm my semester registration',
    description:
      'Every time I click “confirm registration” the page reloads and shows “unexpected error (REG-500)”. I have tried two browsers and cleared my cache. My courses are selected but the registration is not being saved.',
    priority: 'HIGH',
    resolution:
      'A stale registration lock from a previous failed attempt was blocking your confirmation. The lock was cleared, you confirmed the registration successfully, and the confirmation slip is now available.',
    rating: 5,
    feedback: 'It worked on the first try after the fix.',
  },
  {
    category: 'Course Registration Problem',
    subject: 'Elective registration closed before the published deadline',
    description:
      'The elective registration page closed at noon, but the notice said the window would remain open until 5:00 pm. I was planning to register for two electives after my morning lecture.',
    priority: 'NORMAL',
    resolution:
      'The window closed early because of a scheduled maintenance job. The registration page was reopened for the affected students for 24 hours and you registered both electives.',
    rating: 3,
    feedback: 'The extra window helped, but the early closure caused a lot of confusion.',
  },
  {
    category: 'Missing Registered Course',
    subject: 'Course I registered in the first window disappeared after I added a minor',
    description:
      'After I added the Entrepreneurship minor, one of my core courses, MKT 305, disappeared from my registered list. I need both the core course and the minor courses on my record.',
    priority: 'HIGH',
    resolution:
      'Adding the minor replaced the core course selection instead of appending to it. MKT 305 was restored alongside your minor courses and the registration total is correct.',
    rating: 5,
    feedback: 'Everything is back in the right place.',
  },
  {
    category: 'Fees Payment Not Reflected',
    subject: 'GHS 3,200 fees payment not reflected on my student account',
    description:
      'I paid GHS 3,200 at the bank on Monday using my student ID as the reference. The teller slip is attached. My portal balance still shows the full amount and I cannot print my examination clearance.',
    priority: 'HIGH',
    resolution:
      'The payment was received but held in the suspense account because the reference had a transposed digit. It was matched to your student ID, posted to your account and your examination clearance is now available.',
    rating: 5,
    feedback: 'The receipt and clearance were both available the next morning.',
  },
  {
    category: 'Incorrect Financial Balance',
    subject: 'Balance shows arrears I already paid in full',
    description:
      'My portal shows GHS 1,850 in arrears, but I cleared the full semester bill in two instalments and have both receipts. This is blocking my hostel application.',
    priority: 'HIGH',
    resolution:
      'The second instalment had been posted as a credit to a different semester. It was transferred to the current semester, the arrears cleared to zero and the hostel application block was removed.',
    rating: 5,
    feedback: 'The hostel application went through immediately after the fix.',
  },
  {
    category: 'Payment Receipt Issue',
    subject: 'Receipt shows the wrong amount after a part payment',
    description:
      'I paid GHS 1,000 toward my fees but the receipt shows GHS 100. The bank slip clearly shows 1,000 and the amount was deducted from my account. I need the receipt corrected for my sponsorship claim.',
    priority: 'NORMAL',
    resolution:
      'A decimal point error was made during receipt entry. The receipt was voided and reissued for GHS 1,000, and the corrected copy is available for download in your portal.',
    rating: 4,
    feedback: 'The corrected receipt was accepted by my sponsor.',
  },
  {
    category: 'Refund or Billing Inquiry',
    subject: 'Refund for a withdrawn course has not been paid',
    description:
      'I withdrew from a 2-credit elective during the refund window and was told the refund would be processed within 14 working days. It has now been three weeks and there is no credit on my account.',
    priority: 'NORMAL',
    resolution:
      'The refund request had stalled at the finance approval step. It was approved, credited to your student account and reflected in your current balance.',
    rating: 4,
    feedback: 'The money is showing as a credit now.',
  },
  {
    category: 'Fees Payment Not Reflected',
    subject: 'Bank transfer made on Friday still missing from my portal',
    description:
      'My guardian transferred GHS 2,450 from a different bank on Friday afternoon. The transfer reference is attached. The funds have left the sending account but my portal still shows nothing.',
    priority: 'NORMAL',
    resolution:
      'Interbank transfers settle after two working days. The funds were located in the settlement report and posted to your account, bringing your balance up to date.',
    rating: 5,
    feedback: 'The team explained the settlement delay clearly.',
  },
  {
    category: 'Incorrect Financial Balance',
    subject: 'Charged twice for the same hostel facility fee',
    description:
      'My statement shows two separate hostel facility charges of GHS 600 on the same day. I only applied for one room and have one allocation letter. Please reverse the duplicate charge.',
    priority: 'NORMAL',
    resolution:
      'A retried payment created a duplicate charge. The second charge was reversed and your balance corrected, with the reversal visible on your statement.',
    rating: 5,
    feedback: 'The duplicate was reversed within a day.',
  },
  {
    category: 'Payment Receipt Issue',
    subject: 'Cannot download the official receipt for my final payment',
    description:
      'The receipt page shows “file not found” for my final payment of GHS 4,100. I need the official receipt to submit to my employer’s education support scheme.',
    priority: 'LOW',
    resolution:
      'The receipt file had not been copied to the document store. It was regenerated and is now downloadable from the receipts section of your portal.',
    rating: 5,
    feedback: 'Downloaded it without any trouble.',
  },
  {
    category: 'Student ID Card',
    subject: 'Replacement student ID card not printed after three weeks',
    description:
      'I paid for a replacement ID card after mine was stolen and was told it would be ready in five working days. Three weeks later the card office says it cannot find my request.',
    priority: 'HIGH',
    resolution:
      'The replacement request had failed during batch printing. It was resubmitted on the next batch, printed, and your card is ready for collection at the student administration desk.',
    rating: 4,
    feedback: 'Collected the card the day after the update.',
  },
  {
    category: 'Personal Information Correction',
    subject: 'Date of birth on my student record is wrong',
    description:
      'My student record shows 14 March 2003, but my birth certificate says 14 May 2003. This mismatch is causing problems with my national service registration.',
    priority: 'NORMAL',
    resolution:
      'The date of birth was corrected against the birth certificate you submitted. All linked documents, including your student status letter, now show 14 May 2003.',
    rating: 5,
    feedback: 'The national service portal accepted the corrected details.',
  },
  {
    category: 'Admission or Enrolment Record',
    subject: 'Enrolment record shows the wrong entry year',
    description:
      'My record says I enrolled in 2024, but I started in 2023. This affects my expected graduation year and the fee schedule shown on my portal.',
    priority: 'NORMAL',
    resolution:
      'The enrolment year was corrected to 2023 and your expected graduation term and fee schedule were recalculated. A corrected enrolment letter was issued.',
    rating: 5,
    feedback: 'My graduation year finally looks right.',
  },
  {
    category: 'General Administrative Complaint',
    subject: 'Security desk turned me away with a valid appointment slip',
    description:
      'I had a 10:00 appointment with the examinations officer and a printed slip, but the security desk said no appointments were being accepted that day. I missed the slot and had to rebook.',
    priority: 'LOW',
    resolution:
      'The security team had received an outdated access list. The list was corrected, the desk was briefed, and your rebooked appointment was prioritised with an apology from the office.',
    rating: 4,
    feedback: 'The second visit went smoothly and the officer was expecting me.',
  },
  {
    category: 'Student ID Card',
    subject: 'ID card photo is not mine after the replacement batch',
    description:
      'The replacement ID card I collected has another student’s photograph on it, although the name and ID number are mine. I cannot use it for examinations or library access.',
    priority: 'URGENT',
    resolution:
      'A photo file mismatch affected your batch. A new card was printed with your correct photograph on an urgent basis and the faulty card was collected for secure disposal.',
    rating: 5,
    feedback: 'The new card was ready before my first examination.',
  },
  {
    category: 'Student Portal Access',
    subject: 'Student portal shows a blank dashboard after sign-in',
    description:
      'I can sign in, but the dashboard stays blank and the menu does not load. This happens in Chrome and Firefox, on campus Wi-Fi and on mobile data. I cannot see my courses or results.',
    priority: 'HIGH',
    resolution:
      'A corrupted profile preference prevented the dashboard from loading. The preference was reset on the server and your dashboard now loads normally in all browsers.',
    rating: 5,
    feedback: 'Everything loads instantly now.',
  },
  {
    category: 'Password or Account Problem',
    subject: 'Password reset email never arrives',
    description:
      'I requested a password reset three times yesterday and no email arrived, including in spam. I am now locked out of the account I need for an assignment due tomorrow.',
    priority: 'HIGH',
    resolution:
      'Your student email address had been mistyped in the account record, so reset messages were going to a non-existent address. The address was corrected and a reset link was delivered successfully.',
    rating: 5,
    feedback: 'The reset link arrived within a minute after the fix.',
  },
  {
    category: 'Online Learning Platform',
    subject: 'Lecture recordings will not play in the LMS',
    description:
      'Every recording in the LMS shows a spinning loader and then “playback failed”. Other students in my group can watch the same recordings. I have tried clearing my browser cache.',
    priority: 'NORMAL',
    resolution:
      'Your account was missing the media playback permission assigned to your programme. The permission was added and all lecture recordings now play normally.',
    rating: 4,
    feedback: 'The recordings play now, although I lost a day of study time.',
  },
  {
    category: 'Other Digital Academic Services',
    subject: 'Cannot access the library’s off-campus journal database',
    description:
      'When I sign in to the library database from home, it says my institution does not have access. On campus it works. I need the database for my literature review this week.',
    priority: 'NORMAL',
    resolution:
      'The off-campus access certificate had expired. The certificate was renewed and the proxy was updated; you can now reach the journal database from any network.',
    rating: 5,
    feedback: 'Off-campus access works again.',
  },
  {
    category: 'Student Portal Access',
    subject: 'Portal locks me out after every second login',
    description:
      'I can log in, use the portal, then get locked out the next time I try. The message says “too many attempts” even though I entered the correct password. This has happened five times.',
    priority: 'HIGH',
    resolution:
      'A background sync job was replaying failed login events against your account. The job was corrected, your failed-attempt counter was reset and the lockouts have stopped.',
    rating: 4,
    feedback: 'No lockouts since the fix.',
  },
  {
    category: 'Password or Account Problem',
    subject: 'Account locked after a legitimate password change',
    description:
      'I changed my password as prompted and was immediately locked out. The new password works on the email system but not on the student portal. I need access before my online quiz opens.',
    priority: 'URGENT',
    resolution:
      'The portal and email systems had diverged during the password sync. Your password was synchronised across both systems and the account unlocked without another reset.',
    rating: 5,
    feedback: 'Access restored before the quiz window opened.',
  },
  {
    category: 'Online Learning Platform',
    subject: 'Quiz answers are not saving on the e-learning platform',
    description:
      'I completed a 20-question quiz, clicked save on each answer, and the platform submitted a blank attempt. The same thing happened to two classmates in the same course.',
    priority: 'HIGH',
    resolution:
      'A recent platform update broke the autosave call for the quiz activity. The vendor patch was applied, affected attempts were reopened, and your answers were saved on the second attempt.',
    rating: 4,
    feedback: 'The reopened attempt saved correctly.',
  },
  {
    category: 'General Inquiry',
    subject: 'How do I obtain a letter confirming my student status?',
    description:
      'I need an official letter confirming that I am a current student for a bank account application. I am not sure which office issues it or what details I need to provide.',
    priority: 'LOW',
    resolution:
      'Student status letters are issued by Student Administration. You were sent the request form and collection details, and a signed letter was issued for your bank application.',
    rating: 5,
    feedback: 'The instructions were clear and the letter was ready the next day.',
  },
  {
    category: 'Unlisted Issue',
    subject: 'No category fits my complaint about the shuttle schedule',
    description:
      'The evening shuttle now leaves 25 minutes before the published time, so students finishing late lectures keep missing it. There is no obvious category for transport complaints.',
    priority: 'LOW',
    resolution:
      'The transport coordinator reviewed the timetable and restored the published departure time. The change was communicated on the notice board and the shuttle now leaves as scheduled.',
    rating: 4,
    feedback: 'The shuttle has been on time for two weeks.',
  },
  {
    category: 'General Inquiry',
    subject: 'Requesting guidance on the deferral process for medical reasons',
    description:
      'I will be undergoing surgery next month and may need to defer the semester. I want to understand the process, the documents required and the deadline for applying.',
    priority: 'NORMAL',
    resolution:
      'You were sent the medical deferral guidance, the required form and the deadline for the current semester. A conditional deferral was recorded pending the medical report.',
    rating: 5,
    feedback: 'The process was explained sensitively and in plain language.',
  },
  {
    category: 'Unlisted Issue',
    subject: 'Faculty notice board still shows last semester’s timetable',
    description:
      'The notice board outside the faculty office still has last semester’s timetable, which is confusing new students. The online timetable is correct but the board has not been updated.',
    priority: 'LOW',
    resolution:
      'The faculty administrator printed and mounted the current timetable. A weekly check was added to the notice board routine and the outdated copy was removed.',
    rating: 4,
    feedback: 'The board was updated the next morning.',
  },
  {
    category: 'General Inquiry',
    subject: 'Need clarification on the graduation clearance sequence',
    description:
      'I am graduating this year and I am unsure which offices to visit for clearance and in what order. The portal lists the offices but not the sequence or the documents needed at each step.',
    priority: 'LOW',
    resolution:
      'A graduation clearance guide was prepared with the correct office sequence, documents and opening hours. It was sent to you and published on the graduation page.',
    rating: 5,
    feedback: 'The checklist made the whole process much less stressful.',
  },
  {
    category: 'Unlisted Issue',
    subject: 'Repeated water outage in the hostel block with no notice',
    description:
      'Block C has had no running water for three days, and no notice was posted. Students are buying water and the situation is affecting hygiene. The issue does not fit the listed categories.',
    priority: 'HIGH',
    resolution:
      'A failed booster pump was repaired and the water supply was restored. The hostel office now posts outage notices on the block WhatsApp group whenever maintenance is scheduled.',
    rating: 4,
    feedback: 'Water is back and we now get advance notice of maintenance.',
  },
];

/* -------------------------------------------------------------------------- */
/* 20 open reports                                                            */
/* -------------------------------------------------------------------------- */

const OPEN_SCENARIOS: Scenario[] = [
  {
    category: 'Missing Examination Results',
    subject: 'Missing result for ACC 210 after a medical resit',
    description:
      'I sat the ACC 210 medical resit on 12 October and submitted my medical certificate to the examinations office. The result is still missing and my sponsor needs the updated transcript this month.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    category: 'Incorrect Grade',
    subject: 'Grade for LAW 105 recorded as withheld',
    description:
      'My LAW 105 result shows “withheld” even though I completed the course and passed the continuous assessment. I was never informed of any disciplinary or examination issue.',
    priority: 'HIGH',
    status: 'ASSIGNED',
  },
  {
    category: 'Transcript Request or Discrepancy',
    subject: 'Urgent transcript needed for a scholarship deadline',
    description:
      'The scholarship committee requires an official transcript by 20 November. I applied two weeks ago and the request still shows “processing”. I need to know whether it can be expedited.',
    priority: 'URGENT',
    status: 'ACKNOWLEDGED',
  },
  {
    category: 'Examination Eligibility',
    subject: 'Eligibility hold on my index number three days before exams',
    description:
      'My index number appears on the ineligible list because of an outstanding library fine. I paid the fine at the library last week but the hold is still showing and the first paper is on Monday.',
    priority: 'URGENT',
    status: 'ESCALATED',
  },
  {
    category: 'Course Registration Problem',
    subject: 'Portal will not let me drop a course I never attend',
    description:
      'I registered for FRE 201 by mistake and have not attended any lectures. The drop button returns “not permitted” even though the add/drop window is open. I do not want to be examined in the course.',
    priority: 'NORMAL',
    status: 'SUBMITTED',
  },
  {
    category: 'Examination Timetable Issue',
    subject: 'Venue for BAF 302 clashes with another faculty’s exam',
    description:
      'BAF 302 is scheduled in Auditorium B at 14:00, but the same hall is listed for an engineering paper at the same time. My classmates and I need confirmation of the correct venue.',
    priority: 'HIGH',
    status: 'AWAITING_EXTERNAL',
  },
  {
    category: 'Fees Payment Not Reflected',
    subject: 'Cash payment at the bank not showing after 48 hours',
    description:
      'I paid GHS 2,100 in cash at the bank on Tuesday morning using my student ID. The teller confirmed the payment but my portal still shows the previous balance and I cannot register.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    category: 'Incorrect Financial Balance',
    subject: 'Balance increased after an approved scholarship',
    description:
      'A GHS 3,000 scholarship was approved and applied last semester. My new balance is higher than before the scholarship, which suggests the credit was reversed. I need a statement breakdown.',
    priority: 'HIGH',
    status: 'ASSIGNED',
  },
  {
    category: 'Refund or Billing Inquiry',
    subject: 'Duplicate payment for graduation fee',
    description:
      'I was charged the graduation fee twice: once through the portal and once at the bank on the same day. I have both receipts and would like one payment refunded or credited to my account.',
    priority: 'NORMAL',
    status: 'AWAITING_STUDENT',
  },
  {
    category: 'Student ID Card',
    subject: 'ID card damaged and I have an exam next week',
    description:
      'My ID card snapped in my wallet and the chip no longer scans at the examination hall. I need a replacement before next week’s papers, but the card office queue is fully booked.',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
  },
  {
    category: 'Personal Information Correction',
    subject: 'Surname spelled incorrectly on my admission letter',
    description:
      'My surname appears as “Mensimah” on my admission letter but “Mensima” on my birth certificate and student record. The misspelling is now spreading to other documents.',
    priority: 'HIGH',
    status: 'SUBMITTED',
  },
  {
    category: 'Admission or Enrolment Record',
    subject: 'Enrolment record still shows deferred status',
    description:
      'I deferred last semester for medical reasons and have now returned. My record still shows “deferred” and I cannot register for courses or access the LMS.',
    priority: 'NORMAL',
    status: 'AWAITING_STUDENT',
  },
  {
    category: 'Student Portal Access',
    subject: 'Portal works but results tab never loads',
    description:
      'I can log in and see my courses, but the results tab spins indefinitely. Other students can see their results. I need my transcript details for a job application.',
    priority: 'HIGH',
    status: 'ESCALATED',
  },
  {
    category: 'Password or Account Problem',
    subject: 'MFA code goes to an old phone number',
    description:
      'My two-factor authentication code is being sent to my old phone number, which I no longer have. I changed my number at the registry but the portal still uses the old one.',
    priority: 'HIGH',
    status: 'REOPENED',
  },
  {
    category: 'Online Learning Platform',
    subject: 'LMS submissions upload but never complete',
    description:
      'When I upload an assignment, the progress bar reaches 100% and then stays there. The submission is not recorded and the deadline is tomorrow at midnight.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
  },
  {
    category: 'Other Digital Academic Services',
    subject: 'Wi-Fi certificate expired on my laptop',
    description:
      'The campus Wi-Fi asks me to trust a certificate that expired last week and will not connect. My phone connects fine. I need my laptop online for an online examination.',
    priority: 'NORMAL',
    status: 'SUBMITTED',
  },
  {
    category: 'Student Portal Access',
    subject: 'New student cannot see any courses on the portal',
    description:
      'I completed my registration last week but the portal shows no courses and no timetable. My fees are paid and my ID card has been issued.',
    priority: 'NORMAL',
    status: 'AWAITING_ASSIGNMENT',
  },
  {
    category: 'General Inquiry',
    subject: 'Need direction on reporting a staff conduct concern',
    description:
      'I want to raise a concern about how a staff member handled my registration issue, but I am not sure whether this is the right channel or what evidence I should provide.',
    priority: 'NORMAL',
    status: 'AWAITING_STUDENT',
  },
  {
    category: 'Unlisted Issue',
    subject: 'Request to correct a double charge on the alumni portal',
    description:
      'I was charged twice when renewing my alumni membership and the portal has no refund option. The issue is not about student fees, so I am not sure which office handles it.',
    priority: 'LOW',
    status: 'AWAITING_ASSIGNMENT',
  },
  {
    category: 'Unlisted Issue',
    subject: 'Broken lift in the exam hall building',
    description:
      'The only lift in the examination hall building has been out of service for a week. Students with mobility needs are being asked to use the service entrance, which is not always open.',
    priority: 'LOW',
    status: 'ASSIGNED',
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  });
  return ['scrypt', 16384, 8, 1, salt.toString('hex'), derived.toString('hex')].join('$');
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ACKNOWLEDGEMENTS: Record<string, string> = {
  ACAD: 'Thank you for the details. We have pulled your academic record and the original mark sheet, and an officer is reviewing it now.',
  REG: 'Thank you for reporting this. We are checking your registration record against the active timetable group and will update you shortly.',
  FIN: 'Thank you for the receipt details. We are tracing the payment against the bank settlement report.',
  STUAD: 'Thank you for the information. We have logged this with the student administration desk and will confirm the next step.',
  ICT: 'Thank you for the details. We are checking your account permissions and the service logs for the affected system.',
  ADMIN: 'Thank you for reaching out. Your report has been received and is being routed to the appropriate office for action.',
};

const FEEDBACK_TEMPLATES = [
  'The issue was handled faster than I expected. Thank you for following up.',
  'Everything has been corrected and I can see the update on my portal.',
  'Clear communication throughout. I always knew what the next step was.',
  'It took a little longer than I hoped, but the outcome was exactly right.',
  'Thank you for taking the time to explain what went wrong.',
];

function studentEmail(index: number): string {
  return `demo.student${String(index + 1).padStart(2, '0')}@${DOMAIN}`;
}

function studentId(index: number): string {
  return `GCTU-2421${String(index + 1).padStart(3, '0')}`;
}

function at(base: Date, offsetMs: number): Date {
  return new Date(base.getTime() + offsetMs);
}

interface HistorySeed {
  actorId: string;
  actionType:
    | 'CREATED'
    | 'ASSIGNED'
    | 'STATUS_CHANGED'
    | 'RESOLVED'
    | 'CLOSED'
    | 'ESCALATED';
  previousValue: string | null;
  newValue: string;
  createdAt: Date;
  reason?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Seed                                                                       */
/* -------------------------------------------------------------------------- */

async function seedStudents(passwordHash: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'STUDENT' } });
  const students = [];

  for (let index = 0; index < STUDENT_NAMES.length; index += 1) {
    const fullName = STUDENT_NAMES[index]!;
    const email = studentEmail(index);
    const record = await prisma.user.upsert({
      where: { email },
      create: {
        fullName,
        email,
        studentId: studentId(index),
        passwordHash,
        emailVerifiedAt: new Date(),
        accountStatus: 'ACTIVE',
        phone: `+23320${String(1000000 + index * 137).slice(-7)}`,
        preferredContactMethod: 'EMAIL',
      },
      update: { fullName, studentId: studentId(index), accountStatus: 'ACTIVE' },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: record.id, roleId: role.id } },
      create: { userId: record.id, roleId: role.id },
      update: {},
    });

    students.push(record);
  }

  return students;
}

async function seedStaff(passwordHash: string) {
  const departments = await prisma.department.findMany();
  const byCode = new Map(departments.map((department) => [department.code, department]));
  const staffByCode = new Map<string, { id: string; fullName: string }>();

  for (const officer of OFFICERS) {
    const department = byCode.get(officer.code);
    if (!department) {
      throw new Error(
        `Department ${officer.code} is missing. Run "npm run seed" before the demo seed.`,
      );
    }

    const role = await prisma.role.findUniqueOrThrow({ where: { name: officer.role } });
    const record = await prisma.user.upsert({
      where: { email: officer.email },
      create: {
        fullName: officer.fullName,
        email: officer.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        accountStatus: 'ACTIVE',
      },
      update: { fullName: officer.fullName, accountStatus: 'ACTIVE' },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: record.id, roleId: role.id } },
      create: { userId: record.id, roleId: role.id },
      update: {},
    });

    await prisma.departmentMembership.upsert({
      where: {
        departmentId_userId: { departmentId: department.id, userId: record.id },
      },
      create: {
        departmentId: department.id,
        userId: record.id,
        departmentRole: officer.role === 'DEPARTMENT_HEAD' ? 'HEAD' : 'OFFICER',
        isActive: true,
      },
      update: {
        departmentRole: officer.role === 'DEPARTMENT_HEAD' ? 'HEAD' : 'OFFICER',
        isActive: true,
      },
    });

    if (officer.role === 'OFFICER') {
      staffByCode.set(officer.code, { id: record.id, fullName: record.fullName });
    }
  }

  return staffByCode;
}

async function seedCompletedReports(
  students: Array<{ id: string; fullName: string }>,
  staffByCode: Map<string, { id: string; fullName: string }>,
  categories: Map<string, { id: string; departmentId: string; name: string }>,
  departmentsById: Map<string, { code: string | null }>,
  year: number,
  counter: { next: number },
  academicPeriodId: string | null,
) {
  const now = new Date();
  let created = 0;

  for (let index = 0; index < DONE_SCENARIOS.length; index += 1) {
    const scenario = DONE_SCENARIOS[index]!;
    const category = categories.get(scenario.category);
    if (!category) throw new Error(`Unknown category: ${scenario.category}`);

    const referenceNumber = formatReference(year, counter.next);
    counter.next += 1;

    const existing = await prisma.ticket.findUnique({ where: { referenceNumber } });
    if (existing) continue;

    const student = students[index % students.length]!;
    const departmentCode = departmentsById.get(category.departmentId)?.code ?? 'ADMIN';
    const officer = staffByCode.get(departmentCode) ?? staffByCode.get('ADMIN')!;

    // Spread completions across the rolling 14-day dashboard window.
    const createdAt = at(now, -(1 + ((index * 7) % 13)) * DAY - ((index * 5) % 9) * HOUR);
    const resolutionHours = 6 + ((index * 11) % 110);
    const resolvedAt = new Date(
      Math.min(now.getTime() - HOUR, createdAt.getTime() + resolutionHours * HOUR),
    );
    // The first response must always precede the resolution.
    const firstResponseAt = new Date(
      Math.min(
        resolvedAt.getTime() - 30 * 60 * 1000,
        createdAt.getTime() + (1 + ((index * 3) % 8)) * HOUR,
      ),
    );
    const closed = index % 5 === 0;
    const resolutionDueAt = at(createdAt, 72 * HOUR);
    const lastStaffReplyAt = resolvedAt;

    const messages: Array<{
      senderId: string;
      messageBody: string;
      visibility: 'PUBLIC' | 'INTERNAL';
      createdAt: Date;
    }> = [
      {
        senderId: student.id,
        messageBody: scenario.description,
        visibility: 'PUBLIC',
        createdAt: at(createdAt, 5 * 60 * 1000),
      },
      {
        senderId: officer.id,
        messageBody:
          ACKNOWLEDGEMENTS[departmentCode] ??
          'Thank you for your report. We are reviewing the details and will respond shortly.',
        visibility: 'PUBLIC',
        createdAt: firstResponseAt,
      },
      {
        senderId: officer.id,
        messageBody:
          scenario.resolution ??
          'The matter has been reviewed and the requested correction has been made.',
        visibility: 'PUBLIC',
        createdAt: resolvedAt,
      },
    ];

    if (index % 3 === 0) {
      messages.push({
        senderId: officer.id,
        messageBody:
          'Internal note: verified against the source record and approved by the department head before publishing the outcome.',
        visibility: 'INTERNAL',
        createdAt: at(resolvedAt, -30 * 60 * 1000),
      });
    }

    const history: HistorySeed[] = [
      {
        actorId: student.id,
        actionType: 'CREATED',
        previousValue: null,
        newValue: 'SUBMITTED',
        createdAt: at(createdAt, 5 * 60 * 1000),
      },
      {
        actorId: officer.id,
        actionType: 'ASSIGNED',
        previousValue: null,
        newValue: officer.fullName,
        createdAt: at(createdAt, 45 * 60 * 1000),
      },
      {
        actorId: officer.id,
        actionType: 'STATUS_CHANGED',
        previousValue: 'ASSIGNED',
        newValue: 'IN_PROGRESS',
        createdAt: firstResponseAt,
      },
      {
        actorId: officer.id,
        actionType: 'RESOLVED',
        previousValue: 'IN_PROGRESS',
        newValue: 'RESOLVED',
        createdAt: resolvedAt,
        reason: scenario.resolution,
      },
    ];

    if (closed) {
      history.push({
        actorId: student.id,
        actionType: 'CLOSED',
        previousValue: 'RESOLVED',
        newValue: 'CLOSED',
        createdAt: at(resolvedAt, 2 * HOUR),
        reason: null,
      });
    }

    await prisma.ticket.create({
      data: {
        referenceNumber,
        studentId: student.id,
        categoryId: category.id,
        departmentId: category.departmentId,
        assignedToId: officer.id,
        subject: scenario.subject,
        description: scenario.description,
        status: closed ? 'CLOSED' : 'RESOLVED',
        priority: scenario.priority,
        source: 'STUDENT',
        academicPeriodId,
        preferredContactMethod: 'EMAIL',
        studentEmail: studentEmail(index % STUDENT_NAMES.length),
        createdAt,
        updatedAt: closed ? at(resolvedAt, 2 * HOUR) : resolvedAt,
        firstResponseAt,
        firstResponseDueAt: at(createdAt, 8 * HOUR),
        resolutionDueAt,
        firstResponseOverdue: false,
        resolutionOverdue: false,
        assignedAt: at(createdAt, 45 * 60 * 1000),
        lastStudentReplyAt: at(createdAt, 5 * 60 * 1000),
        lastStaffReplyAt,
        resolvedAt,
        closedAt: closed ? at(resolvedAt, 2 * HOUR) : null,
        confirmedAt: at(resolvedAt, 3 * HOUR),
        resolutionSummary: scenario.resolution ?? null,
        messages: { create: messages },
        history: {
          create: history.map((entry) => ({
            actorId: entry.actorId,
            actionType: entry.actionType,
            previousValue: entry.previousValue,
            newValue: entry.newValue,
            reason: entry.reason ?? null,
            createdAt: entry.createdAt,
          })),
        },
        feedback:
          scenario.rating !== undefined
            ? {
                create: {
                  studentId: student.id,
                  rating: scenario.rating,
                  comment:
                    scenario.feedback ??
                    FEEDBACK_TEMPLATES[index % FEEDBACK_TEMPLATES.length]!,
                  createdAt: at(resolvedAt, 20 * HOUR),
                },
              }
            : undefined,
      },
    });

    created += 1;
  }

  return created;
}

async function seedOpenReports(
  students: Array<{ id: string; fullName: string }>,
  staffByCode: Map<string, { id: string; fullName: string }>,
  categories: Map<string, { id: string; departmentId: string; name: string }>,
  departmentsById: Map<string, { code: string | null }>,
  year: number,
  counter: { next: number },
  academicPeriodId: string | null,
) {
  const now = new Date();
  let created = 0;

  for (let index = 0; index < OPEN_SCENARIOS.length; index += 1) {
    const scenario = OPEN_SCENARIOS[index]!;
    const category = categories.get(scenario.category);
    if (!category) throw new Error(`Unknown category: ${scenario.category}`);

    const referenceNumber = formatReference(year, counter.next);
    counter.next += 1;

    const existing = await prisma.ticket.findUnique({ where: { referenceNumber } });
    if (existing) continue;

    // Offset by the completed reports so each student gets a different mix.
    const student = students[(index + DONE_SCENARIOS.length) % students.length]!;
    const departmentCode = departmentsById.get(category.departmentId)?.code ?? 'ADMIN';
    const officer = staffByCode.get(departmentCode) ?? staffByCode.get('ADMIN')!;

    const status = scenario.status ?? 'SUBMITTED';
    const assigned = !['SUBMITTED', 'AWAITING_ASSIGNMENT'].includes(status);
    const responded = !['SUBMITTED', 'AWAITING_ASSIGNMENT', 'ASSIGNED'].includes(status);

    const createdAt = at(now, -(((index * 5) % 12) * DAY) - ((index * 7) % 20) * HOUR);
    const firstResponseDueAt = at(createdAt, 8 * HOUR);
    const firstResponseAt = responded
      ? new Date(
          Math.min(
            now.getTime() - 2 * HOUR,
            createdAt.getTime() + (2 + (index % 6)) * HOUR,
          ),
        )
      : null;
    const statusUpdateAt = new Date(
      Math.min(now.getTime() - HOUR, createdAt.getTime() + 24 * HOUR),
    );
    const resolutionDueAt = at(createdAt, 72 * HOUR);
    const resolutionOverdue = now.getTime() > resolutionDueAt.getTime();
    const assignedAt = assigned ? at(createdAt, (1 + (index % 4)) * HOUR) : null;

    const messages: Array<{
      senderId: string;
      messageBody: string;
      visibility: 'PUBLIC' | 'INTERNAL';
      createdAt: Date;
    }> = [
      {
        senderId: student.id,
        messageBody: scenario.description,
        visibility: 'PUBLIC',
        createdAt: at(createdAt, 5 * 60 * 1000),
      },
    ];

    if (responded) {
      messages.push({
        senderId: officer.id,
        messageBody:
          ACKNOWLEDGEMENTS[departmentCode] ??
          'Thank you for your report. We are reviewing the details and will respond shortly.',
        visibility: 'PUBLIC',
        createdAt: firstResponseAt!,
      });
    }

    if (status === 'AWAITING_STUDENT') {
      messages.push({
        senderId: officer.id,
        messageBody:
          'We need one more document from you before we can proceed. Please upload it here or bring a copy to the office so we can continue.',
        visibility: 'PUBLIC',
        createdAt: statusUpdateAt,
      });
    }

    if (status === 'ESCALATED') {
      messages.push({
        senderId: officer.id,
        messageBody:
          'This has been escalated to the department head because it is time-sensitive. You will receive an update within one working day.',
        visibility: 'PUBLIC',
        createdAt: statusUpdateAt,
      });
    }

    if (status === 'REOPENED') {
      messages.push({
        senderId: student.id,
        messageBody:
          'The issue came back after the first fix, so I am reopening the report with the same details.',
        visibility: 'PUBLIC',
        createdAt: statusUpdateAt,
      });
    }

    const history: HistorySeed[] = [
      {
        actorId: student.id,
        actionType: 'CREATED',
        previousValue: null,
        newValue: 'SUBMITTED',
        createdAt: at(createdAt, 5 * 60 * 1000),
      },
    ];

    if (assignedAt) {
      history.push({
        actorId: officer.id,
        actionType: 'ASSIGNED',
        previousValue: null,
        newValue: officer.fullName,
        createdAt: assignedAt,
      });
    }

    if (firstResponseAt) {
      history.push({
        actorId: officer.id,
        actionType: 'STATUS_CHANGED',
        previousValue: 'ASSIGNED',
        newValue: status,
        createdAt: firstResponseAt,
      });
    }

    if (status === 'ESCALATED') {
      history.push({
        actorId: officer.id,
        actionType: 'ESCALATED',
        previousValue: 'IN_PROGRESS',
        newValue: 'ESCALATED',
        createdAt: statusUpdateAt,
        reason: 'First response target and resolution target both breached.',
      });
    }

    await prisma.ticket.create({
      data: {
        referenceNumber,
        studentId: student.id,
        categoryId: category.id,
        departmentId: category.departmentId,
        assignedToId: assigned ? officer.id : null,
        subject: scenario.subject,
        description: scenario.description,
        status,
        priority: scenario.priority,
        source: 'STUDENT',
        academicPeriodId,
        preferredContactMethod: 'EMAIL',
        studentEmail: studentEmail((index + DONE_SCENARIOS.length) % STUDENT_NAMES.length),
        createdAt,
        updatedAt: now,
        firstResponseAt,
        firstResponseDueAt,
        resolutionDueAt,
        firstResponseOverdue:
          firstResponseAt === null && now.getTime() > firstResponseDueAt.getTime(),
        resolutionOverdue,
        assignedAt,
        escalatedAt: status === 'ESCALATED' ? statusUpdateAt : null,
        escalationLevel: status === 'ESCALATED' ? 2 : 0,
        lastStudentReplyAt: at(createdAt, 5 * 60 * 1000),
        lastStaffReplyAt: responded ? firstResponseAt : null,
        reopenedCount: status === 'REOPENED' ? 1 : 0,
        reminderCycleStartedAt: assignedAt,
        lastMeaningfulStaffActionAt: responded ? firstResponseAt : null,
        nextReminderAt:
          status === 'ESCALATED' || status === 'AWAITING_EXTERNAL'
            ? at(now, 2 * HOUR)
            : null,
        remindersSentInCycle: status === 'ESCALATED' ? 3 : 0,
        messages: { create: messages },
        history: {
          create: history.map((entry) => ({
            actorId: entry.actorId,
            actionType: entry.actionType,
            previousValue: entry.previousValue,
            newValue: entry.newValue,
            reason: entry.reason ?? null,
            createdAt: entry.createdAt,
          })),
        },
      },
    });

    created += 1;
  }

  return created;
}

async function main(): Promise<void> {
  const departments = await prisma.department.findMany();
  if (departments.length === 0) {
    throw new Error('No departments found. Run "npm run seed" before the demo seed.');
  }

  const categories = await prisma.category.findMany();
  const categoryByName = new Map(
    categories.map((category) => [
      category.name,
      {
        id: category.id,
        departmentId: category.departmentId ?? '',
        name: category.name,
      },
    ]),
  );

  for (const scenario of [...DONE_SCENARIOS, ...OPEN_SCENARIOS]) {
    if (!categoryByName.has(scenario.category)) {
      throw new Error(`Category "${scenario.category}" is missing. Run "npm run seed" first.`);
    }
  }

  const studentPasswordHash = hashPassword(STUDENT_PASSWORD);
  const staffPasswordHash = hashPassword(STAFF_PASSWORD);
  const students = await seedStudents(studentPasswordHash);
  const staffByCode = await seedStaff(staffPasswordHash);

  const departmentsById = new Map(
    departments.map((department) => [department.id, { code: department.code }]),
  );

  const year = new Date().getUTCFullYear();
  const startingSequence = 1000;
  const counter = { next: startingSequence };
  const currentPeriod = await prisma.academicPeriod.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });
  const academicPeriodId = currentPeriod?.id ?? null;

  const completed = await seedCompletedReports(
    students,
    staffByCode,
    categoryByName,
    departmentsById,
    year,
    counter,
    academicPeriodId,
  );
  const open = await seedOpenReports(
    students,
    staffByCode,
    categoryByName,
    departmentsById,
    year,
    counter,
    academicPeriodId,
  );

  // Move the reference counter past the demo range so new reports never clash.
  await prisma.$executeRaw`
    INSERT INTO counters (name, value)
    VALUES (${`ticket_reference_${year}`}, ${BigInt(counter.next + 1000)})
    ON CONFLICT (name) DO UPDATE
    SET value = GREATEST(counters.value, ${BigInt(counter.next + 1000)});
  `;

  process.stdout.write(
    [
      'Demo seed complete.',
      `  Students: ${students.length}`,
      `  Staff: ${OFFICERS.length}`,
      `  Completed reports created: ${completed}`,
      `  Open reports created: ${open}`,
      '',
      `  Student sign-in: demo.student01@${DOMAIN} / ${STUDENT_PASSWORD}`,
      `  Staff sign-in:   officer.acad@${DOMAIN} / ${STAFF_PASSWORD}`,
      '',
    ].join('\n'),
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
