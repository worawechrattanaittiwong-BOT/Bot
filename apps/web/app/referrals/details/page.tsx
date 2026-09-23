import Link from "next/link";
import { ScenovaBrand } from "../../../components/ScenovaBrand";
import { ScenovaIcon } from "../../../components/ScenovaIcon";
import styles from "./details.module.css";

const flow = [
  {
    number: "1",
    icon: "copy",
    title: "Share your invite link",
    copy: "Send your personal SCENOVA invite link or code to a friend."
  },
  {
    number: "2",
    icon: "users",
    title: "Your friend joins",
    copy: "They create a SCENOVA account through your invite link."
  },
  {
    number: "3",
    icon: "wallet",
    title: "They buy an eligible plan",
    copy: "Rewards are created only from eligible paid purchases."
  },
  {
    number: "4",
    icon: "layers",
    title: "You earn from the network",
    copy: "You can earn from purchases made across up to 4 levels below you."
  }
];

const levels = [
  { level: 1, rate: 7, label: "People you invite directly" },
  { level: 2, rate: 5, label: "People invited by your Level 1" },
  { level: 3, rate: 3, label: "People invited by your Level 2" },
  { level: 4, rate: 1, label: "People invited by your Level 3" }
];

export default function ReferralDetailsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/referrals" aria-label="Back to Invite & Earn">
          <ScenovaBrand className={styles.brand}/>
        </Link>
        <Link className={styles.backButton} href="/referrals">
          ← Back to Invite & Earn
        </Link>
      </header>

      <section className={styles.hero}>
        <span className={styles.kicker}>INVITE & EARN GUIDE</span>
        <h1>How Invite & Earn Works</h1>
        <p>
          Build your SCENOVA referral network and earn commission when members in your
          network make eligible paid purchases.
        </p>
        <div className={styles.rateBanner}>
          <b>7% + 5% + 3% + 1%</b>
          <span>Maximum combined commission per eligible sale: 16%</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>01</span>
          <div>
            <h2>Simple Flow</h2>
            <p>From sharing your link to earning a reward.</p>
          </div>
        </div>

        <div className={styles.flow}>
          {flow.map((step, index) => (
            <div className={styles.flowItem} key={step.number}>
              <article className={styles.flowCard}>
                <span className={styles.stepNumber}>{step.number}</span>
                <div className={styles.flowIcon}><ScenovaIcon name={step.icon} size={22}/></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
              {index < flow.length - 1 && <span className={styles.arrow}>→</span>}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>02</span>
          <div>
            <h2>Your 4-Level Network</h2>
            <p>Levels are based on each member's relationship to you.</p>
          </div>
        </div>

        <div className={styles.pyramidWrap}>
          <div className={styles.pyramid}>
            <div className={`${styles.pyramidRow} ${styles.youRow}`}>
              <div className={styles.youCard}>
                <small>YOU</small>
                <b>Your referral network</b>
              </div>
            </div>

            {levels.map(item => (
              <div
                key={item.level}
                className={`${styles.pyramidRow} ${styles["level" + item.level]}`}
              >
                <div className={styles.levelLabel}>
                  <span>LEVEL {item.level}</span>
                  <b>{item.rate}%</b>
                  <small>{item.label}</small>
                </div>
                <div className={styles.people} aria-hidden="true">
                  {Array.from({ length: item.level * 2 + 1 }).map((_, index) => (
                    <span key={index}><ScenovaIcon name="account" size={15}/></span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <aside className={styles.relativeNote}>
            <ScenovaIcon name="info" size={19}/>
            <div>
              <b>Levels are relative to each member.</b>
              <p>
                Someone who is your Level 2 can still have their own Level 1.
                Every member can keep building their own network.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>03</span>
          <div>
            <h2>What You Earn</h2>
            <p>Example when a member in your network buys a 1,000 THB eligible plan.</p>
          </div>
        </div>

        <div className={styles.exampleGrid}>
          {levels.map(item => (
            <article className={styles.exampleCard} key={item.level}>
              <span>Your Level {item.level} buys</span>
              <strong>1,000 THB</strong>
              <small>You earn</small>
              <b>{item.rate * 10} THB</b>
              <em>{item.rate}% commission</em>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <span>04</span>
          <div>
            <h2>How One Sale Is Shared</h2>
            <p>One eligible sale can reward up to 4 people above the buyer.</p>
          </div>
        </div>

        <div className={styles.saleExample}>
          <div className={styles.chain}>
            <div><b>A</b><small>Gets 1%</small><strong>10 THB</strong></div>
            <span>←</span>
            <div><b>B</b><small>Gets 3%</small><strong>30 THB</strong></div>
            <span>←</span>
            <div><b>C</b><small>Gets 5%</small><strong>50 THB</strong></div>
            <span>←</span>
            <div><b>D</b><small>Gets 7%</small><strong>70 THB</strong></div>
            <span>←</span>
            <div className={styles.buyer}><b>E</b><small>Buys plan</small><strong>1,000 THB</strong></div>
          </div>
          <div className={styles.totalLine}>
            <span>Total commission from this 1,000 THB sale</span>
            <b>160 THB</b>
            <em>16% maximum</em>
          </div>
        </div>

        <p className={styles.exampleExplanation}>
          In this example, E is D's Level 1, C's Level 2, B's Level 3 and A's Level 4.
          The same person can therefore appear at a different level depending on whose network is being viewed.
        </p>
      </section>

      <section className={styles.rules}>
        <div className={styles.sectionTitle}>
          <span>05</span>
          <div>
            <h2>Important to Know</h2>
            <p>Simple rules for customer rewards.</p>
          </div>
        </div>

        <div className={styles.ruleGrid}>
          <div><ScenovaIcon name="status" size={17}/><span>Only eligible paid purchases create commission.</span></div>
          <div><ScenovaIcon name="close" size={17}/><span>Trial and free access do not create commission.</span></div>
          <div><ScenovaIcon name="wallet" size={17}/><span>Commission is based on the actual eligible amount paid.</span></div>
          <div><ScenovaIcon name="clock" size={17}/><span>Rewards enter a review period before becoming available.</span></div>
          <div><ScenovaIcon name="shield" size={17}/><span>Your sponsor is linked when your account is created.</span></div>
          <div><ScenovaIcon name="refresh" size={17}/><span>Refunded or reversed purchases can cancel related commission.</span></div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <ScenovaBrand className={styles.footerBrand}/>
          <p>Share your link. Grow your network. Earn from eligible purchases.</p>
        </div>
        <Link className={styles.primaryButton} href="/referrals">
          Go to Invite & Earn <span>→</span>
        </Link>
      </footer>
    </main>
  );
}
