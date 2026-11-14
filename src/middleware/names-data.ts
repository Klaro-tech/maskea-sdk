// Word lists for the opt-in "name" type. Deliberately modest: a list-based detector only finds names it knows about, or names introduced by a cue
// ("Mr", "Name:", "patient"). It will miss unusual names and cannot replace a trained model; see benchmarks/pii-accuracy for measured numbers.

const words = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean).map((w) => w.toLowerCase()))

export const FIRST_NAMES = words(`
aarav aarti abdul abhay abhishek aditi aditya ahmed aisha ajay akash akhil alan alex alexander alice alicia amanda amar amit amita amy ananya anand andrea andrew angela anil anita anjali ankit ann anna anthony anu anup anusha arjun arun aryan asha ashok ashwin ayesha barbara benjamin bharat bhavna brian carlos carol caroline catherine charles charlotte chen chris christian christine claire daniel david deepa deepak deepika dev devi dhruv diana diego divya dmitri dorothy edward elena elizabeth ella emily emma eric ethan eva fatima felix francesca frank gaurav george gita gopal gregory hamza hannah hans harish harry hassan helen henry hiroshi hussain ian igor imran indira isabel isha ishaan jacob jaya james jane janet jason jennifer jessica jiten joan joe john jonathan jose joseph joshua juan judith julia julie kabir kamal karan karen karthik kate katherine kavita kavya keith kevin kiran kirti krishna kunal kumar lakshmi laura lauren leela leo lily linda lisa lucas luis madhav mahesh maria mariam mark martin mary mateo matthew maya meena meera megha mei michael michelle mohamed mohammad mohan monica mukesh nadia naveen neha neil nicholas nikhil nina nisha nitin olga oliver omar pablo pallavi pankaj paul pooja prakash pranav prasad pratik preeti priya priyanka rachel radha rahul raj rajesh rajiv rakesh ram ramesh ravi rebecca richard rishi rita robert rohan rohit roshni ruchi rupa sachin sakshi salman samantha samir sandeep sandra sanjay sanjana sara sarah satish saurabh seema shalini shankar sharon shilpa shiv shreya shruti siddharth simran sneha sofia sonia sonal sophia stephen steven sudha sunil suresh susan sushma swati tanvi tara thomas tina uday uma usha vanessa varun vijay vikas vikram vinay vineet vishal vivek wei william xavier yash yasmin yogesh yuki zainab zara zoya
`)

// First names that are also ordinary words: only treated as a name when the surname is a known one.
export const AMBIGUOUS_FIRST = words("mark will may april grace rose hope bill pat jack sunny max dawn faith joy amber summer ray rich drew chase")

export const SURNAMES = words(`
abraham agarwal ahmed ali anderson bailey banerjee bansal bhat bose brown chakraborty chatterjee chauhan chawla chen clark davis desai dhillon dixit
dutta evans fernandes garcia ghosh gill gonzalez gupta hall hassan hernandez hill iyer jackson jain jha johnson joshi kapoor kaur khan khanna kim kulkarni
kumar lee lewis lopez malhotra martin martinez mehra mehta menon miller mishra mitra moore mukherjee murthy nair nguyen pandey pant patel perez pillai
rai rao reddy robinson rodriguez roy saxena sen shah sharma shetty singh sinha smith srivastava taylor thomas thompson tiwari trivedi verma walker
white williams wilson wright yadav young
`)

// Capitalised words that follow a first name in ordinary text and are not surnames.
export const NOT_SURNAME = words(`
and the for with from this that will was were has have had said says called joined notes meeting team group bank hospital university college road street
avenue lane inc ltd llc corp company limited please thanks thank regards dear sent signed approved reviewed
`)

export const TITLES = "Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Shri|Smt|Sri|Kumari"
export const NAME_LABELS = "Name|Full name|Customer name|Customer|Patient name|Patient|Employee name|Employee|Applicant|Contact person|Contact|Candidate|Account holder|Cardholder|Beneficiary"
