import {
  ChallengeDifficulty,
  ChallengeStatus,
  CourseLevel,
  CourseStatus,
  LessonContentMode,
  LessonStatus,
  PrismaClient,
  QuizQuestionType,
  QuizStatus,
  QuizTargetType,
  SectionStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

interface LessonSeed {
  position: number;
  slug: string;
  title: string;
  summary: string;
  textContent: string;
  contentMode?: LessonContentMode;
  videoProvider?: string;
  videoAssetId?: string;
  videoDurationSeconds?: number;
  quiz?: LessonQuizSeed;
}

interface QuizChoiceSeed {
  position: number;
  text: string;
  isCorrect: boolean;
}

interface QuizQuestionSeed {
  position: number;
  prompt: string;
  choices: QuizChoiceSeed[];
}

interface LessonQuizSeed {
  title: string;
  description: string;
  passPercentage: number;
  questions: QuizQuestionSeed[];
}

interface SectionSeed {
  position: number;
  title: string;
  lessons: LessonSeed[];
}

interface CourseSeed {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  level: CourseLevel;
  sections: SectionSeed[];
}

interface ChallengeHintSeed {
  position: 1 | 2;
  title: string;
  content: string;
}

interface ChallengeSeed {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: ChallengeDifficulty;
  points: number;
  flag: string;
  hints: ChallengeHintSeed[];
}

const LEGACY_LESSON_SLUGS_BY_COURSE_SLUG: Record<string, Record<string, string[]>> = {
  'network-defense-foundations': {
    'ndf-traffic-map': ['network-segmentation-basics', 'reading-the-traffic-map'],
    'ndf-packet-view': ['secure-remote-access', 'packet-capture-walkthrough'],
    'ndf-service-review': ['logging-useful-network-events', 'service-exposure-review'],
    'ndf-firewall-rules': ['firewall-rule-hygiene'],
  },
  'web-application-attack-lab': {
    'waa-surface-map': ['mapping-application-surfaces', 'application-surface-mapping'],
    'waa-proxy-tour': ['proxy-setup'],
    'waa-injection': ['injection-risk-patterns', 'input-injection-signals'],
    'waa-access-control': ['broken-access-control-checks', 'access-control-checks'],
    'waa-reporting': ['reporting-web-findings', 'writing-the-finding'],
  },
  'incident-response-operations': {
    'iro-first-hour': ['incident-intake-and-severity', 'the-first-hour'],
    'iro-evidence': ['evidence-preservation', 'evidence-handling'],
    'iro-isolation': ['containment-decision-records', 'host-isolation-decisions'],
    'iro-communications': ['recovery-and-lessons-learned', 'status-communications'],
  },
  'advanced-threat-hunting': {
    'ath-hypothesis-writing': ['building-hunt-hypotheses', 'hypothesis-writing'],
    'ath-telemetry-fit': ['endpoint-telemetry-joins', 'telemetry-fit'],
    'ath-query-review': ['query-review'],
    'ath-findings': ['converting-hunts-to-detections', 'from-hunt-to-finding'],
    'ath-retrospective': ['hunt-retrospective'],
  },
};

const courseSeeds: CourseSeed[] = [
  {
    slug: 'network-defense-foundations',
    title: 'Network Defense Foundations',
    shortDescription:
      'Build the baseline skills for reading traffic, spotting weak signals, and hardening a small network.',
    description:
      'A practical introduction to defensive networking for new operators. You will learn how traffic moves, where useful evidence appears, and how to turn basic observations into a repeatable investigation workflow.',
    level: CourseLevel.BEGINNER,
    sections: [
      {
        position: 1,
        title: 'Orientation',
        lessons: [
          {
            position: 1,
            slug: 'ndf-traffic-map',
            title: 'Reading the Traffic Map',
            summary:
              'Understand hosts, services, ports, and the path an event takes through a network.',
            textContent: [
              'Intro',
              'Network defense begins with a clear picture of how communication normally moves. Before an alert can be judged, an operator needs to know which host started the conversation, which service answered, which port was used, and whether the path makes sense for the asset. A traffic map is not only a diagram. It is a habit of asking where the evidence fits: endpoint, switch, firewall, DNS, proxy, identity provider, or application log.',
              'For a beginner, the goal is not to memorize every protocol. The goal is to slow down enough to describe the event accurately. A workstation contacting a printer on TCP 9100 is different from the same workstation contacting an unfamiliar internet address on an uncommon port. A server listening on port 443 may be expected for a web application, but surprising on a small file server. Good defensive work starts with that kind of careful comparison.',
              'Learning objectives',
              '- Identify hosts, services, ports, protocols, assets, and entry points in a network event.\n- Explain the difference between expected business traffic and traffic that needs review.\n- Trace a simple traffic path across internal zones and external destinations.\n- Record observations in a way another defender can validate.',
              'Prerequisites',
              '- Basic familiarity with IP addresses, hostnames, and the idea of client and server communication.\n- A willingness to separate observation from conclusion.\n- No packet analysis or firewall administration experience is required.',
              'Core concepts',
              'A host is any system that can send or receive traffic: laptop, server, printer, router, sensor, or cloud workload. An asset is a host with business meaning, such as a payroll server, domain controller, or public web application. A service is a function reachable over the network, such as web, DNS, file sharing, remote administration, or email. A port is a numbered doorway used by a service. A protocol is the set of rules that shape the conversation.',
              'Traffic direction matters. Outbound traffic from a user device to an update service may be ordinary. Inbound traffic from the internet to an administrative port usually deserves immediate review. Zone boundaries matter too. A development subnet, a guest wireless network, and a production database network should not have the same expected paths. Entry points are places where traffic first reaches a protected environment, such as VPN, web gateway, mail gateway, or public load balancer.',
              'A useful map does not need to be beautiful. It needs enough labels to help the next decision. Write down source, destination, port, protocol, asset owner, network zone, time, and why the path is expected or unexpected. When the answer is unknown, label it unknown instead of guessing.',
              'Defensive scenario',
              'A help desk ticket says a finance workstation is slow. Network logs show repeated outbound connections from that workstation to an external IP on TCP 443 and occasional DNS lookups for a vendor update domain. At first glance this could be normal web traffic. The defender checks the asset inventory and learns the workstation runs approved accounting software that updates every morning. The timing matches the maintenance window, but the destination IP is new. The operator records the normal parts, flags the new destination for vendor validation, and watches for the same pattern on peer systems before escalating.',
              'Operator workflow',
              'Start by naming the source and destination. Add the port and protocol. Check whether the source asset should make that kind of connection. Check whether the destination is internal, approved external, or unknown. Compare the time and frequency to normal behavior. Look for related evidence in DNS, authentication, endpoint, proxy, or firewall logs. Decide whether the event is expected, needs more context, or requires escalation. End with a short note that explains the reasoning.',
              'Common mistakes',
              '- Treating a port number as proof of the application. Port 443 often carries HTTPS, but a port alone is not enough.\n- Ignoring direction. Inbound administrative access and outbound user browsing have very different risk.\n- Assuming unknown means malicious. Unknown means the next task is validation.\n- Forgetting asset importance. The same traffic can matter more on a domain controller than on a lab workstation.\n- Keeping the map only in your head.',
              'Key terms',
              'Host: a device or workload that communicates on the network. Asset: a host with business context and ownership. Service: a network-accessible function. Port: a number used to reach a service. Protocol: rules for a network conversation. Entry point: a boundary where traffic enters an environment. Network zone: a group of systems with similar trust or purpose. Baseline: a practical view of normal behavior.',
              'Wrap-up',
              'Reading the traffic map is the foundation for later investigation. The best first answer is often a clean description: who talked to whom, over what service, from which zone, at what time, and whether that path belongs. Once that is clear, the next defensive move becomes much easier.',
              'Completion note',
              'Read the lesson body, review the key terms, and complete the lesson quiz. A passing quiz result confirms that you can describe simple network traffic without jumping to unsupported conclusions.',
            ].join('\n\n'),
            contentMode: LessonContentMode.TEXT,
            quiz: {
              title: 'Reading the Traffic Map Checkpoint',
              description:
                'Checks whether the learner can describe hosts, services, ports, direction, and defensive traffic context.',
              passPercentage: 70,
              questions: [
                {
                  position: 1,
                  prompt:
                    'Which observation best describes a network event in a way another defender can validate?',
                  choices: [
                    {
                      position: 1,
                      text: 'The workstation is probably compromised because it used the internet.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Host FIN-WS-14 connected outbound to 203.0.113.50 on TCP 443 at 09:15.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'The traffic was strange because the port number looked unusual.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'The network is noisy and should be blocked until reviewed.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 2,
                  prompt:
                    'Why is traffic direction important during a first defensive review?',
                  choices: [
                    {
                      position: 1,
                      text: 'Direction helps determine whether a connection is inbound, outbound, or internal.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'Direction proves which user caused the event.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Direction replaces the need to check asset inventory.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Direction is useful only for encrypted traffic.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 3,
                  prompt:
                    'A server is listening on TCP 443. What is the safest beginner interpretation?',
                  choices: [
                    {
                      position: 1,
                      text: 'It is definitely a public web application.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'The port suggests HTTPS-like service, but asset context is still needed.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'It should always be blocked because encrypted traffic is risky.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'It cannot be reviewed without decrypting every packet.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 4,
                  prompt:
                    'Which item belongs in a useful traffic map note?',
                  choices: [
                    {
                      position: 1,
                      text: 'Only whether the event feels suspicious.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Source, destination, port, protocol, zone, time, and expectation.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'Only the tool that generated the alert.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'A final incident severity before any review.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 5,
                  prompt:
                    'What should an operator do when the purpose of a connection is unknown?',
                  choices: [
                    {
                      position: 1,
                      text: 'Mark it as malicious immediately.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Ignore it until users complain.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Label it unknown, gather context, and validate ownership or expected use.',
                      isCorrect: true,
                    },
                    {
                      position: 4,
                      text: 'Delete the source host from the inventory.',
                      isCorrect: false,
                    },
                  ],
                },
              ],
            },
          },
          {
            position: 2,
            slug: 'ndf-packet-view',
            title: 'Packet Capture Walkthrough',
            summary: 'Review a simple packet capture workflow with protected training media.',
            textContent: [
              'Intro',
              'Packet captures can look intimidating because they show many tiny details at once. A defensive analyst does not need to read every byte to get value. The first task is to understand the conversation: which system started it, which system answered, what protocol appears to be in use, and how the activity changed over time. This lesson uses text-first guidance while preserving the protected media slot for a future walkthrough.',
              'Packet review should happen only with authorized data from approved training, monitoring, or incident response work. The purpose here is not to teach stealth or intrusion. The purpose is to build a safe reading habit so a defender can turn raw network evidence into a clear timeline.',
              'Learning objectives',
              '- Read source and destination details from a simple packet conversation.\n- Connect ports and protocols to likely services without treating them as proof.\n- Recognize useful DNS, HTTP, and TLS indicators at a beginner level.\n- Build a short timeline that supports a defensive conclusion.',
              'Prerequisites',
              '- Familiarity with hosts, services, ports, and traffic direction.\n- Access only to authorized packet captures or lab examples.\n- No requirement to install or operate packet capture tools for this lesson.',
              'Core concepts',
              'A packet capture records network conversations as packets. Each packet usually has a timestamp, source address, destination address, protocol, and length. Many packets belong to a single conversation or flow. Reading one packet in isolation is less useful than reading the flow around it.',
              'Layer thinking keeps the review organized. At the network layer, ask which IP addresses are involved. At the transport layer, ask which ports and connection behavior appear. At the application layer, look for protocol clues such as DNS query names, HTTP methods or status codes, and TLS handshake information. Encrypted traffic can still provide useful metadata, such as destination, timing, certificate subject, server name indication when present, and volume.',
              'DNS often appears before web or application traffic. A client may ask for a name, receive one or more IP addresses, and then connect to one of them. HTTP can reveal host headers, paths, methods, status codes, and user agents when it is not encrypted. TLS hides content but still shows the start of an encrypted session and sometimes a requested server name. None of these fields alone proves intent. Together they help explain the activity.',
              'Defensive scenario',
              'A monitoring alert says a workstation contacted an external address shortly after a user opened a browser. The authorized packet sample shows a DNS query for a known software vendor, a response with two IP addresses, and a TLS connection to one returned address on TCP 443. The TLS session lasts eight seconds and transfers a moderate amount of data. The operator notes that the sequence is consistent with a software update check, then compares the domain and timing with endpoint inventory and proxy logs before closing or escalating the event.',
              'Operator workflow',
              'Begin with the first packet in the conversation and record the timestamp. Identify the source and destination addresses. Group related packets into a flow. Note the apparent transport protocol and ports. Look backward for a DNS query or other setup traffic. Look forward for retries, failures, large transfers, or connections to related destinations. Summarize the timeline in plain language: first this name was resolved, then this address was contacted, then this response or session followed. Finish by listing what the capture can and cannot prove.',
              'Common mistakes',
              '- Reading a single packet as if it tells the whole story.\n- Treating encryption as a dead end instead of using safe metadata.\n- Forgetting that DNS answers can include multiple addresses.\n- Assuming a port always identifies the true application.\n- Sharing packet data without considering privacy and authorization.',
              'Key terms',
              'Packet: a unit of network data. Flow: a related sequence of packets between endpoints. Source: the sender for a packet. Destination: the receiver for a packet. DNS query: a request to translate a name into address information. HTTP method: an application action such as GET or POST. TLS handshake: the setup phase for an encrypted session. Timeline: ordered evidence that explains what happened.',
              'Wrap-up',
              'A packet capture is most useful when it supports a careful story. Who asked for what? Which answer came back? Which connection followed? What changed over time? Beginner defenders should prefer modest, accurate conclusions over dramatic claims. The capture is one evidence source that becomes stronger when matched with logs, inventory, and known business behavior.',
              'Completion note',
              'Read the lesson body, note how DNS, HTTP, and TLS metadata support timelines, and complete the quiz. The protected media placeholder remains attached for a future guided walkthrough but is not required for the text-first MVP lesson.',
            ].join('\n\n'),
            contentMode: LessonContentMode.HYBRID,
            quiz: {
              title: 'Packet Capture Walkthrough Checkpoint',
              description:
                'Checks safe packet capture interpretation, timeline thinking, and beginner protocol metadata review.',
              passPercentage: 70,
              questions: [
                {
                  position: 1,
                  prompt:
                    'What is the best first goal when reviewing an authorized packet capture?',
                  choices: [
                    {
                      position: 1,
                      text: 'Read every byte before writing any notes.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Identify the conversation, direction, protocol clues, and timeline.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'Assume encrypted sessions are malicious.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Focus only on the largest packet.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 2,
                  prompt:
                    'Why can DNS traffic be useful when reviewing later web or TLS activity?',
                  choices: [
                    {
                      position: 1,
                      text: 'It may show which name was resolved before a connection.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'It decrypts the web session content.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'It proves the destination is always safe.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'It replaces the need for timestamps.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 3,
                  prompt:
                    'A TLS session hides application content. Which metadata may still help a defender?',
                  choices: [
                    {
                      position: 1,
                      text: 'Destination, timing, session setup, and sometimes requested server name.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'The exact password typed by the user.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'A guaranteed label showing whether the traffic is malicious.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'The full decrypted HTTP body without authorization.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 4,
                  prompt:
                    'Which packet review habit best avoids unsupported conclusions?',
                  choices: [
                    {
                      position: 1,
                      text: 'Use one packet as the final source of truth.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Describe what the capture shows and what other evidence is needed.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'Ignore related DNS and proxy logs.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Treat all failed connections as incidents.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 5,
                  prompt:
                    'Which sequence is a reasonable beginner timeline summary?',
                  choices: [
                    {
                      position: 1,
                      text: 'The user was attacked because the capture contains TCP.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'A DNS query resolved a vendor name, then the host opened a TLS session to one returned address.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'The packet length was high, so the event is confirmed malicious.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'The destination used port 443, so no review is needed.',
                      isCorrect: false,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        position: 2,
        title: 'Hardening Basics',
        lessons: [
          {
            position: 1,
            slug: 'ndf-service-review',
            title: 'Service Exposure Review',
            summary:
              'Identify open services and decide which ones belong in the current environment.',
            textContent: [
              'Intro',
              'A service exposure review asks a practical defensive question: should this service be reachable from this place? The answer depends on asset purpose, business need, network zone, ownership, and compensating controls. An exposed service is not automatically a crisis, but every exposed service deserves a reason. When no one can explain the reason, the defender has found useful work.',
              'This lesson focuses on inventory and prioritization rather than attack technique. You will learn how to compare observed services with expected services, record uncertainty, and choose a calm next step. The protected media placeholder remains attached because this topic is useful for a future walkthrough, but the seeded text now stands on its own.',
              'Learning objectives',
              '- Build a basic service inventory for a small environment.\n- Compare observed services with expected business use.\n- Prioritize exposure review based on reachability, asset value, and service sensitivity.\n- Document exceptions without hiding risk.',
              'Prerequisites',
              '- Understanding of hosts, ports, services, and network zones.\n- Access to authorized inventory, monitoring, or configuration data.\n- No need for offensive scanning procedures in this lesson.',
              'Core concepts',
              'A service inventory is a list of network-accessible functions and the assets that provide them. It should include the service name when known, port, protocol, owning team, expected source networks, business purpose, and review date. The inventory does not need to be perfect before it is useful. Even a small list can reveal stale administrative access, forgotten test systems, or services exposed to broader networks than intended.',
              'Expected services are services that match the asset role. A public web server may expose HTTP and HTTPS through a load balancer. A database server may listen on a database port, but only from application subnets. A user laptop may need outbound web and update traffic, but should rarely accept inbound administrative connections from the whole network. Unexpected services are those that do not match the role, owner, or zone.',
              'Risk prioritization keeps the review manageable. Start with services reachable from the internet, partner networks, guest networks, or low-trust zones. Next review sensitive assets such as identity systems, security tools, backups, finance systems, and production databases. Give extra attention to administrative services, legacy protocols, anonymous access, and broad source ranges. The first question is not how to break the service. The first question is whether the service belongs there.',
              'Defensive scenario',
              'A small organization reviews its external exposure before a policy audit. The inventory shows a customer portal on TCP 443, a mail gateway, and a remote administration service on a nonstandard port. The portal and mail gateway have owners and documented purpose. The remote administration service has no owner in the ticket history and accepts connections from any internet source. The defender does not attempt to access it. Instead, they validate asset ownership, ask whether the service is still required, restrict allowed sources while review continues, and open a change record for removal if no owner confirms need.',
              'Operator workflow',
              'Collect an authorized list of observed services. Group them by asset and network zone. For each service, write the expected purpose or mark it unknown. Confirm the owner and the source networks that should reach it. Prioritize items with external reachability, sensitive assets, administrative function, or missing ownership. Recommend one of four outcomes: keep as documented, restrict source access, disable after approval, or create an exception with expiration and review date. Record the decision path so the next operator can repeat it.',
              'Common mistakes',
              '- Treating every open port as equally urgent.\n- Closing a service before confirming business impact and ownership.\n- Accepting broad reachability because it has always existed.\n- Reviewing only internet-facing systems and ignoring internal administrative surfaces.\n- Creating permanent exceptions with no expiration or owner.',
              'Key terms',
              'Service inventory: a record of reachable services and their context. Exposure: the ability for a source network to reach a service. Owner: the person or team accountable for the asset or service. Exception: a documented deviation from the preferred control. Source restriction: limiting which networks can reach a service. Administrative service: a service used to manage systems. Review date: the next time an exposure decision must be checked.',
              'Wrap-up',
              'Service exposure review is a maintenance discipline. It reduces surprise, improves incident response, and makes firewall and segmentation decisions easier. A good review does not shame teams for running services. It asks whether each service has a current purpose, a responsible owner, and access limited to the people and systems that need it.',
              'Completion note',
              'Complete the reading, confirm you can explain expected versus unexpected services, and pass the lesson quiz. Future protected media can demonstrate the same checklist visually without changing the defensive workflow.',
            ].join('\n\n'),
            contentMode: LessonContentMode.HYBRID,
            quiz: {
              title: 'Service Exposure Review Checkpoint',
              description:
                'Checks service inventory, expected access, prioritization, and safe defensive review decisions.',
              passPercentage: 70,
              questions: [
                {
                  position: 1,
                  prompt:
                    'What is the central question in a service exposure review?',
                  choices: [
                    {
                      position: 1,
                      text: 'Can this service be exploited from the internet?',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Should this service be reachable from this source or zone?',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'Which tool can produce the longest service list?',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'How quickly can every open service be removed?',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 2,
                  prompt:
                    'Which service should usually be prioritized first for review?',
                  choices: [
                    {
                      position: 1,
                      text: 'An internally reachable printer service with a documented owner.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'A public remote administration service with no confirmed owner.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'An internal web service used only by a known application subnet.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'A documented backup service limited to backup servers.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 3,
                  prompt:
                    'What should an operator do before disabling an unexpected service?',
                  choices: [
                    {
                      position: 1,
                      text: 'Confirm ownership, business purpose, and change impact.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'Assume it is malicious and remove it immediately.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Publish the service details to all users.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Ignore it if the port number is familiar.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 4,
                  prompt:
                    'Which field makes a service inventory more useful for future reviews?',
                  choices: [
                    {
                      position: 1,
                      text: 'The favorite tool of the previous operator.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Owner, expected source networks, purpose, and review date.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'Only the port number.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Only whether the service is old.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 5,
                  prompt:
                    'What is the safest way to handle a required exception?',
                  choices: [
                    {
                      position: 1,
                      text: 'Document owner, reason, allowed sources, expiration, and next review.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'Leave it undocumented so attackers cannot find it.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Make it permanent to avoid future work.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Apply the exception to every similar host.',
                      isCorrect: false,
                    },
                  ],
                },
              ],
            },
          },
          {
            position: 2,
            slug: 'ndf-firewall-rules',
            title: 'Firewall Rule Hygiene',
            summary: 'Translate intended access into simple, auditable firewall rules.',
            textContent: [
              'Intro',
              'Firewall rule hygiene is the practice of keeping access decisions specific, documented, reviewed, and easy to understand. A firewall is not a magic shield. It is a policy enforcement point. If the policy says too many sources can reach too many destinations, the firewall will faithfully allow too much traffic. Good defensive work makes the intended access clear and removes access that no longer has a reason.',
              'This lesson focuses on least privilege, rule order, documentation, and change control. It does not require building a production firewall. The goal is to learn how to read and reason about rules so that changes reduce risk without surprising the business.',
              'Learning objectives',
              '- Explain least privilege for network access rules.\n- Read a simple allow or deny rule using source, destination, service, and action.\n- Recognize why rule order and broad rules can change the effective policy.\n- Describe a safe review and change-control process.',
              'Prerequisites',
              '- Understanding of hosts, services, ports, protocols, and network zones.\n- Basic awareness that firewalls evaluate traffic against configured rules.\n- No vendor-specific firewall administration experience is required.',
              'Core concepts',
              'Least privilege means allowing only the access needed for a defined purpose. In firewall terms, a strong allow rule names a specific source or source group, a specific destination or destination group, a specific service, an action, and a reason. A weak allow rule uses broad values such as any source, any destination, any service, or no expiration. Broad rules may be convenient during an emergency, but they become long-term risk if no one comes back to clean them up.',
              'Rule order matters on many firewalls. A broad allow rule above a careful deny rule can make the deny rule ineffective. A shadowed rule is a rule that never applies because an earlier rule already matches the traffic. A duplicate rule adds confusion without changing behavior. An expired exception is a temporary rule that lived past its review date. Hygiene is the work of finding these conditions and resolving them through approved changes.',
              'Deny behavior should also be understandable. Some environments use an implicit deny at the end of the policy. Others add explicit deny rules for visibility or logging. The important point for beginners is to know how the environment expresses default behavior and where logs will appear when traffic is blocked.',
              'Defensive scenario',
              'A team asks for database access from a reporting server to a production database. The initial request says "allow reporting network to database network." A defender helps refine it: source is one reporting server, destination is the production database listener, service is the database port, owner is the analytics team, reason is monthly reporting, and review date is in 90 days. The rule is added below existing administrative rules and above the default deny. Later review shows the project ended, so the rule is removed through change control.',
              'Operator workflow',
              'Start each review by exporting or viewing the current rule set through the approved process. Group rules by business purpose where possible. Look for broad allows, expired exceptions, missing owners, duplicate entries, and shadowed rules. For each candidate change, confirm the owner and expected traffic. Propose the smallest safe adjustment: narrow the source, narrow the destination, narrow the service, add an expiration, improve logging, or remove the rule after approval. Test the expected allowed path and the expected denied path in a controlled way. Update documentation after the change, not days later.',
              'Common mistakes',
              '- Using any source or any destination because the real requirement is unclear.\n- Adding a new allow rule without checking whether an older rule already covers the traffic.\n- Forgetting that rule order can change the effective result.\n- Removing rules without owner confirmation or rollback planning.\n- Treating documentation as optional.',
              'Key terms',
              'Least privilege: allowing only the access needed. Allow rule: a rule that permits matching traffic. Deny rule: a rule that blocks matching traffic. Rule order: the sequence in which rules are evaluated. Shadowed rule: a rule made ineffective by an earlier match. Exception: temporary or approved deviation from normal policy. Change control: the process for approving, scheduling, testing, and recording changes. Default deny: policy posture where unmatched traffic is blocked.',
              'Wrap-up',
              'Firewall hygiene makes network policy easier to defend. Specific rules help operators understand what should happen. Documentation helps reviewers understand why it should happen. Change control helps the organization improve security without breaking necessary work. The cleanest rule set is not the shortest one; it is the one whose access decisions are intentional and reviewable.',
              'Completion note',
              'Complete the reading, review the key terms, and pass the lesson quiz. You should be able to explain why a specific, documented rule is safer than a broad allow rule with no owner or expiration.',
            ].join('\n\n'),
            contentMode: LessonContentMode.TEXT,
            quiz: {
              title: 'Firewall Rule Hygiene Checkpoint',
              description:
                'Checks least privilege, rule order, documentation, and safe firewall review habits.',
              passPercentage: 70,
              questions: [
                {
                  position: 1,
                  prompt:
                    'Which firewall rule best reflects least privilege?',
                  choices: [
                    {
                      position: 1,
                      text: 'Allow any source to any destination for any service.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Allow one reporting server to one database service for a documented purpose.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'Allow an entire guest network to all production systems.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Allow every administrator subnet forever with no review date.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 2,
                  prompt:
                    'Why can rule order matter in a firewall policy?',
                  choices: [
                    {
                      position: 1,
                      text: 'An earlier broad match can prevent a later specific rule from taking effect.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'Rule order changes the IP address of the destination.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Rules are always evaluated randomly.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'Only deny rules have positions.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 3,
                  prompt:
                    'What is a shadowed rule?',
                  choices: [
                    {
                      position: 1,
                      text: 'A rule that is hidden from all administrators.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'A rule that never applies because an earlier rule already matches the traffic.',
                      isCorrect: true,
                    },
                    {
                      position: 3,
                      text: 'A rule used only during nighttime maintenance.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'A rule that blocks encrypted traffic.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 4,
                  prompt:
                    'Which information should be documented for a firewall exception?',
                  choices: [
                    {
                      position: 1,
                      text: 'Owner, business reason, scope, expiration, and review date.',
                      isCorrect: true,
                    },
                    {
                      position: 2,
                      text: 'Only the port number.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Only who requested it most recently.',
                      isCorrect: false,
                    },
                    {
                      position: 4,
                      text: 'No documentation, because exceptions should be private.',
                      isCorrect: false,
                    },
                  ],
                },
                {
                  position: 5,
                  prompt:
                    'What is the safest review action for a broad allow rule with unclear purpose?',
                  choices: [
                    {
                      position: 1,
                      text: 'Leave it forever because it might be important.',
                      isCorrect: false,
                    },
                    {
                      position: 2,
                      text: 'Delete it immediately without checking impact.',
                      isCorrect: false,
                    },
                    {
                      position: 3,
                      text: 'Confirm ownership and purpose, then narrow or remove it through change control.',
                      isCorrect: true,
                    },
                    {
                      position: 4,
                      text: 'Copy it to every other firewall.',
                      isCorrect: false,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'web-application-attack-lab',
    title: 'Web Application Attack Lab',
    shortDescription:
      'Practice safe exploitation patterns against intentionally vulnerable web surfaces.',
    description:
      'A guided course for understanding common web application flaws from the attacker perspective. The emphasis stays on controlled labs, evidence, and the mental model needed to report risks responsibly.',
    level: CourseLevel.INTERMEDIATE,
    sections: [
      {
        position: 1,
        title: 'Reconnaissance',
        lessons: [
          {
            position: 1,
            slug: 'waa-surface-map',
            title: 'Application Surface Mapping',
            summary: 'Catalog routes, inputs, auth boundaries, and data-bearing features.',
            textContent:
              'Surface mapping keeps testing disciplined. List routes, forms, API calls, role boundaries, and places where user-provided values are rendered or stored.\n\nA clear map prevents random probing. It also helps you explain why a finding matters when the same flaw appears across several similar endpoints.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'waa-proxy-tour',
            title: 'Proxy Setup',
            summary: 'Configure an intercepting proxy for controlled request inspection.',
            textContent:
              'The video placeholder represents a protected walkthrough. The final lesson can reuse this content slot when the media service is connected.',
            contentMode: LessonContentMode.HYBRID,
          },
        ],
      },
      {
        position: 2,
        title: 'Controlled Exploitation',
        lessons: [
          {
            position: 1,
            slug: 'waa-injection',
            title: 'Input Injection Signals',
            summary: 'Use safe probes to identify injection behavior and document the boundary.',
            textContent:
              'Injection testing starts with harmless inputs that reveal parsing behavior. A useful test changes one variable at a time and records both the request and the response.\n\nDo not jump from a signal to destructive proof. In a training environment, the goal is to understand the vulnerable path and produce evidence that a defender or developer can reproduce.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'waa-access-control',
            title: 'Access Control Checks',
            summary:
              'Test whether resource ownership and role checks hold across common paths.',
            textContent:
              'Access control failures often hide in ordinary workflows. Compare what two users with different ownership or roles can read, modify, and delete.\n\nDocument the expected rule before showing the bypass. This makes the finding easier to fix and prevents the report from becoming a collection of unrelated screenshots.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 3,
            slug: 'waa-reporting',
            title: 'Writing the Finding',
            summary: 'Turn lab evidence into a concise, reproducible report.',
            textContent:
              'A strong finding states impact, affected surface, reproduction steps, evidence, and a practical remediation path. Keep speculation out of the main claim.\n\nWhen the same root cause affects multiple endpoints, group them under one finding and include enough examples to prove the pattern.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
  {
    slug: 'incident-response-operations',
    title: 'Incident Response Operations',
    shortDescription:
      'Learn the response cadence for triage, containment, recovery, and post-incident review.',
    description:
      'This course walks through the operator rhythm of incident response. You will move from first signal to action plan, then practice containment and communication choices that keep a response calm and measurable.',
    level: CourseLevel.INTERMEDIATE,
    sections: [
      {
        position: 1,
        title: 'Triage',
        lessons: [
          {
            position: 1,
            slug: 'iro-first-hour',
            title: 'The First Hour',
            summary:
              'Stabilize the response with scope, severity, owners, and immediate next moves.',
            textContent:
              'The first hour is about reducing uncertainty. Capture what triggered the response, what assets might be affected, who owns the decision path, and what action can safely reduce risk.\n\nAvoid overfitting to the first alert. Treat the early narrative as a hypothesis that can change as evidence arrives.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'iro-evidence',
            title: 'Evidence Handling',
            summary: 'Preserve evidence without slowing response.',
            textContent:
              'The protected media slot will demonstrate evidence collection order, chain of custody notes, and common mistakes that make later review harder.',
            contentMode: LessonContentMode.VIDEO,
          },
        ],
      },
      {
        position: 2,
        title: 'Containment',
        lessons: [
          {
            position: 1,
            slug: 'iro-isolation',
            title: 'Host Isolation Decisions',
            summary:
              'Choose isolation steps based on confidence, business impact, and evidence needs.',
            textContent:
              'Isolation is a tradeoff. Disconnect too early and you may lose visibility; wait too long and the incident may spread. Use severity, confidence, and business dependency to decide.\n\nWhen possible, preserve remote collection paths while blocking risky outbound movement. Record the time, owner, reason, and expected rollback condition.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'iro-communications',
            title: 'Status Communications',
            summary: 'Keep internal updates factual, brief, and useful for decision makers.',
            textContent:
              'Good response updates are factual and time-bound. State what is known, what changed since the last update, what is being done now, and where help is needed.\n\nAvoid dramatic language. Clear communication keeps stakeholders aligned and gives operators room to work.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
  {
    slug: 'advanced-threat-hunting',
    title: 'Advanced Threat Hunting',
    shortDescription:
      'Use hypotheses, telemetry, and adversary tradecraft to hunt across complex environments.',
    description:
      'A deeper course for operators who already know the defensive basics. The lessons focus on building hunt hypotheses, choosing telemetry, and iterating when early evidence does not confirm the expected path.',
    level: CourseLevel.ADVANCED,
    sections: [
      {
        position: 1,
        title: 'Hunt Design',
        lessons: [
          {
            position: 1,
            slug: 'ath-hypothesis-writing',
            title: 'Hypothesis Writing',
            summary:
              'Convert adversary behavior into a measurable question for the environment.',
            textContent:
              'A hunt hypothesis links behavior, environment, and evidence. It should be narrow enough to test and broad enough to catch a meaningful class of activity.\n\nStrong hypotheses avoid vendor-specific assumptions until the telemetry plan is clear. Start with the behavior, then translate into available data.',
            contentMode: LessonContentMode.TEXT,
          },
          {
            position: 2,
            slug: 'ath-telemetry-fit',
            title: 'Telemetry Fit',
            summary: 'Pick data sources that can answer the hunt question with useful confidence.',
            textContent:
              'Telemetry fit is about whether the data can prove or disprove the hypothesis. Missing fields, noisy collection, or short retention can all make a hunt inconclusive.\n\nRecord blind spots as outcomes. A hunt that reveals a coverage gap still improves the defensive program when that gap gets prioritized.',
            contentMode: LessonContentMode.HYBRID,
          },
        ],
      },
      {
        position: 2,
        title: 'Execution',
        lessons: [
          {
            position: 1,
            slug: 'ath-query-review',
            title: 'Query Review',
            summary:
              'Review hunt queries and result pivots through protected training media.',
            textContent:
              'The final video service can attach query walkthroughs here. The lesson model already knows this is video-first content with protected media.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 2,
            slug: 'ath-findings',
            title: 'From Hunt to Finding',
            summary: 'Decide whether the result is benign, suspicious, or ready for response.',
            textContent:
              'Not every hunt hit is an incident. Compare the result against baseline behavior, asset context, timing, and known administrative activity.\n\nWhen evidence remains ambiguous, document the next query or data source needed. Good hunting is iterative, not theatrical.',
            contentMode: LessonContentMode.HYBRID,
          },
          {
            position: 3,
            slug: 'ath-retrospective',
            title: 'Hunt Retrospective',
            summary:
              'Capture what improved detection coverage and what still needs instrumentation.',
            textContent:
              'A retrospective turns a hunt into program improvement. Capture the hypothesis, data sources, queries, result, coverage gaps, and recommended next hunt.\n\nThe most useful output may be a new detection, a tuned alert, a documented blind spot, or a confirmed baseline.',
            contentMode: LessonContentMode.TEXT,
          },
        ],
      },
    ],
  },
];

const demoChallengeSeed: ChallengeSeed = {
  slug: 'phishing-awareness',
  title: 'Phishing Awareness Challenge',
  description:
    'Review the suspicious message details and identify the defensive training flag.',
  category: 'Defensive Analysis',
  difficulty: ChallengeDifficulty.EASY,
  points: 100,
  flag: 'CYBER_SAFE_PHISHING_101',
  hints: [
    {
      position: 1,
      title: 'Look at the ask',
      content: 'Focus on what the sender is pushing the recipient to do urgently.',
    },
    {
      position: 2,
      title: 'Check the training cue',
      content: 'The flag follows the all-caps CYBER_SAFE training phrase format.',
    },
  ],
};

const PROTECTED_DEMO_MEDIA_PROVIDER = 'protected-demo-media';
const DEFAULT_PROTECTED_DEMO_VIDEO_DURATION_SECONDS = 300;

function resolveLessonContentMode(lesson: LessonSeed) {
  return lesson.contentMode ?? LessonContentMode.TEXT;
}

function lessonHasVideoContent(contentMode: LessonContentMode) {
  return contentMode === LessonContentMode.VIDEO || contentMode === LessonContentMode.HYBRID;
}

function resolveLessonTextContent(lesson: LessonSeed, contentMode: LessonContentMode) {
  return contentMode === LessonContentMode.VIDEO ? null : lesson.textContent;
}

function resolveProtectedDemoMediaFields(lesson: LessonSeed, contentMode: LessonContentMode) {
  if (!lessonHasVideoContent(contentMode)) {
    return {
      videoProvider: null,
      videoAssetId: null,
      videoDurationSeconds: null,
    };
  }

  return {
    videoProvider: lesson.videoProvider ?? PROTECTED_DEMO_MEDIA_PROVIDER,
    videoAssetId: lesson.videoAssetId ?? `demo-${lesson.slug}`,
    videoDurationSeconds:
      lesson.videoDurationSeconds ?? DEFAULT_PROTECTED_DEMO_VIDEO_DURATION_SECONDS,
  };
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSeededLessonSlugCandidates(courseSlug: string, lesson: LessonSeed) {
  return uniqueValues([
    lesson.slug,
    ...(LEGACY_LESSON_SLUGS_BY_COURSE_SLUG[courseSlug]?.[lesson.slug] ?? []),
    slugify(lesson.title),
  ]);
}

function buildLegacyReplacementSlug(lessonId: string) {
  return `legacy-${lessonId}`;
}

function hashFlag(flag: string) {
  return createHash('sha256').update(flag).digest('hex');
}

async function findSeededLessonTarget(input: {
  courseId: string;
  courseSlug: string;
  sectionId: string;
  lesson: LessonSeed;
}) {
  const lessonAtSeededPosition = await prisma.lesson.findUnique({
    where: {
      sectionId_position: {
        sectionId: input.sectionId,
        position: input.lesson.position,
      },
    },
    select: {
      id: true,
    },
  });

  if (lessonAtSeededPosition) {
    return lessonAtSeededPosition;
  }

  return prisma.lesson.findFirst({
    where: {
      courseId: input.courseId,
      slug: {
        in: resolveSeededLessonSlugCandidates(input.courseSlug, input.lesson),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
    },
  });
}

async function freeConflictingSeededLessonSlug(input: {
  courseId: string;
  lessonSlug: string;
  targetLessonId: string | null;
}) {
  const slugOwner = await prisma.lesson.findUnique({
    where: {
      courseId_slug: {
        courseId: input.courseId,
        slug: input.lessonSlug,
      },
    },
    select: {
      id: true,
    },
  });

  if (!slugOwner || slugOwner.id === input.targetLessonId) {
    return;
  }

  await prisma.lesson.update({
    where: {
      id: slugOwner.id,
    },
    data: {
      slug: buildLegacyReplacementSlug(slugOwner.id),
      status: LessonStatus.DRAFT,
      publishedAt: null,
    },
  });
}

async function upsertSeededLesson(input: {
  courseId: string;
  courseSlug: string;
  sectionId: string;
  lesson: LessonSeed;
  publishedAt: Date;
}) {
  const contentMode = resolveLessonContentMode(input.lesson);
  const protectedMediaFields = resolveProtectedDemoMediaFields(input.lesson, contentMode);
  const targetLesson = await findSeededLessonTarget(input);

  await freeConflictingSeededLessonSlug({
    courseId: input.courseId,
    lessonSlug: input.lesson.slug,
    targetLessonId: targetLesson?.id ?? null,
  });

  const lessonData = {
    courseId: input.courseId,
    sectionId: input.sectionId,
    title: input.lesson.title,
    slug: input.lesson.slug,
    summary: input.lesson.summary,
    contentMode,
    status: LessonStatus.PUBLISHED,
    position: input.lesson.position,
    textContent: resolveLessonTextContent(input.lesson, contentMode),
    ...protectedMediaFields,
    publishedAt: input.publishedAt,
  };

  if (targetLesson) {
    return prisma.lesson.update({
      where: {
        id: targetLesson.id,
      },
      data: lessonData,
    });
  }

  return prisma.lesson.create({
    data: lessonData,
  });
}

function validateLessonQuizSeed(lesson: LessonSeed) {
  if (!lesson.quiz) {
    return;
  }

  if (lesson.quiz.passPercentage < 0 || lesson.quiz.passPercentage > 100) {
    throw new Error(`Invalid pass percentage for lesson quiz ${lesson.slug}`);
  }

  if (lesson.quiz.questions.length < 1) {
    throw new Error(`Lesson quiz ${lesson.slug} must include at least one question`);
  }

  for (const question of lesson.quiz.questions) {
    if (question.position < 1) {
      throw new Error(`Lesson quiz ${lesson.slug} has an invalid question position`);
    }

    if (question.choices.length !== 4) {
      throw new Error(`Lesson quiz ${lesson.slug} question ${question.position} must have 4 choices`);
    }

    const correctChoices = question.choices.filter((choice) => choice.isCorrect);
    if (correctChoices.length !== 1) {
      throw new Error(
        `Lesson quiz ${lesson.slug} question ${question.position} must have exactly one correct choice`,
      );
    }
  }
}

async function upsertLessonQuiz(input: {
  courseId: string;
  lessonId: string;
  lesson: LessonSeed;
  publishedAt: Date;
}) {
  const quizSeed = input.lesson.quiz;
  if (!quizSeed) {
    return;
  }

  validateLessonQuizSeed(input.lesson);

  const quiz = await prisma.quiz.upsert({
    where: {
      lessonId: input.lessonId,
    },
    update: {
      courseId: input.courseId,
      lessonId: input.lessonId,
      targetType: QuizTargetType.LESSON,
      title: quizSeed.title,
      description: quizSeed.description,
      status: QuizStatus.PUBLISHED,
      passPercentage: quizSeed.passPercentage,
      publishedAt: input.publishedAt,
    },
    create: {
      courseId: input.courseId,
      lessonId: input.lessonId,
      targetType: QuizTargetType.LESSON,
      title: quizSeed.title,
      description: quizSeed.description,
      status: QuizStatus.PUBLISHED,
      passPercentage: quizSeed.passPercentage,
      publishedAt: input.publishedAt,
    },
  });

  const questionPositions = quizSeed.questions.map((question) => question.position);

  for (const questionSeed of quizSeed.questions) {
    const question = await prisma.quizQuestion.upsert({
      where: {
        quizId_position: {
          quizId: quiz.id,
          position: questionSeed.position,
        },
      },
      update: {
        type: QuizQuestionType.MCQ,
        prompt: questionSeed.prompt,
      },
      create: {
        quizId: quiz.id,
        type: QuizQuestionType.MCQ,
        prompt: questionSeed.prompt,
        position: questionSeed.position,
      },
    });

    const choicePositions = questionSeed.choices.map((choice) => choice.position);

    for (const choiceSeed of questionSeed.choices) {
      await prisma.quizChoice.upsert({
        where: {
          questionId_position: {
            questionId: question.id,
            position: choiceSeed.position,
          },
        },
        update: {
          choiceText: choiceSeed.text,
          isCorrect: choiceSeed.isCorrect,
        },
        create: {
          questionId: question.id,
          choiceText: choiceSeed.text,
          position: choiceSeed.position,
          isCorrect: choiceSeed.isCorrect,
        },
      });
    }

    await prisma.quizChoice.deleteMany({
      where: {
        questionId: question.id,
        position: {
          notIn: choicePositions,
        },
      },
    });
  }

  await prisma.quizQuestion.deleteMany({
    where: {
      quizId: quiz.id,
      position: {
        notIn: questionPositions,
      },
    },
  });
}

async function upsertCourse(courseSeed: CourseSeed, publishedAt: Date) {
  const course = await prisma.course.upsert({
    where: {
      slug: courseSeed.slug,
    },
    update: {
      title: courseSeed.title,
      shortDescription: courseSeed.shortDescription,
      description: courseSeed.description,
      level: courseSeed.level,
      status: CourseStatus.PUBLISHED,
      publishedAt,
    },
    create: {
      title: courseSeed.title,
      slug: courseSeed.slug,
      shortDescription: courseSeed.shortDescription,
      description: courseSeed.description,
      level: courseSeed.level,
      status: CourseStatus.PUBLISHED,
      publishedAt,
    },
  });

  const seededLessonIds: string[] = [];

  for (const sectionSeed of courseSeed.sections) {
    const section = await prisma.section.upsert({
      where: {
        courseId_position: {
          courseId: course.id,
          position: sectionSeed.position,
        },
      },
      update: {
        title: sectionSeed.title,
        status: SectionStatus.PUBLISHED,
        publishedAt,
      },
      create: {
        courseId: course.id,
        title: sectionSeed.title,
        position: sectionSeed.position,
        status: SectionStatus.PUBLISHED,
        publishedAt,
      },
    });

    for (const lesson of sectionSeed.lessons) {
      const seededLesson = await upsertSeededLesson({
        courseId: course.id,
        courseSlug: course.slug,
        sectionId: section.id,
        lesson,
        publishedAt,
      });

      await upsertLessonQuiz({
        courseId: course.id,
        lessonId: seededLesson.id,
        lesson,
        publishedAt,
      });

      seededLessonIds.push(seededLesson.id);
    }
  }

  await prisma.lesson.updateMany({
    where: {
      courseId: course.id,
      id: {
        notIn: seededLessonIds,
      },
    },
    data: {
      status: LessonStatus.DRAFT,
      publishedAt: null,
    },
  });
}

async function upsertChallenge(challengeSeed: ChallengeSeed, publishedAt: Date) {
  const challenge = await prisma.challenge.upsert({
    where: {
      slug: challengeSeed.slug,
    },
    update: {
      title: challengeSeed.title,
      description: challengeSeed.description,
      category: challengeSeed.category,
      difficulty: challengeSeed.difficulty,
      points: challengeSeed.points,
      status: ChallengeStatus.PUBLISHED,
      flagHash: hashFlag(challengeSeed.flag),
      publishedAt,
      downloadName: null,
      downloadStorageKey: null,
      downloadSizeBytes: null,
    },
    create: {
      slug: challengeSeed.slug,
      title: challengeSeed.title,
      description: challengeSeed.description,
      category: challengeSeed.category,
      difficulty: challengeSeed.difficulty,
      points: challengeSeed.points,
      status: ChallengeStatus.PUBLISHED,
      flagHash: hashFlag(challengeSeed.flag),
      publishedAt,
    },
  });

  for (const hint of challengeSeed.hints) {
    await prisma.challengeHint.upsert({
      where: {
        challengeId_position: {
          challengeId: challenge.id,
          position: hint.position,
        },
      },
      update: {
        title: hint.title,
        content: hint.content,
      },
      create: {
        challengeId: challenge.id,
        position: hint.position,
        title: hint.title,
        content: hint.content,
      },
    });
  }
}

async function logSeedVerification() {
  const courseSlugs = courseSeeds.map((course) => course.slug);
  const courses = await prisma.course.findMany({
    where: {
      slug: {
        in: courseSlugs,
      },
    },
    orderBy: {
      slug: 'asc',
    },
    select: {
      slug: true,
      lessons: {
        orderBy: [
          {
            section: {
              position: 'asc',
            },
          },
          {
            position: 'asc',
          },
        ],
        select: {
          slug: true,
          contentMode: true,
          videoProvider: true,
          videoAssetId: true,
        },
      },
    },
  });

  for (const course of courses) {
    for (const lesson of course.lessons) {
      console.log(
        '[SEED_LESSON_VERIFY]',
        JSON.stringify({
          courseSlug: course.slug,
          lessonSlug: lesson.slug,
          contentMode: lesson.contentMode,
          hasVideo: Boolean(lesson.videoProvider && lesson.videoAssetId),
        }),
      );
    }
  }

  const challenge = await prisma.challenge.findUnique({
    where: {
      slug: demoChallengeSeed.slug,
    },
    select: {
      slug: true,
      title: true,
      status: true,
      points: true,
      difficulty: true,
      _count: {
        select: {
          hints: true,
        },
      },
    },
  });

  if (challenge) {
    console.log(
      '[SEED_CHALLENGE_VERIFY]',
      JSON.stringify({
        slug: challenge.slug,
        title: challenge.title,
        status: challenge.status,
        points: challenge.points,
        difficulty: challenge.difficulty,
        hintsCount: challenge._count.hints,
      }),
    );
  }
}

async function main() {
  const publishedAt = new Date();

  for (const courseSeed of courseSeeds) {
    await upsertCourse(courseSeed, publishedAt);
  }

  await upsertChallenge(demoChallengeSeed, publishedAt);

  await logSeedVerification();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
