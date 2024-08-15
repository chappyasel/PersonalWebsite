export interface Data {
  aboutMe: AboutMe;
  contacts: Contact[];
  projects: Projects;
}

export interface AboutMe {
  __html: string;
}

export interface Contact {
  name: string;
  link: string;
  image: string;
}

export interface Projects {
  languages: Language[];
  list: Project[];
}

export interface Project {
  name: string;
  link: string;
  image?: string;
  languages: Language[];
}

export type Language =
  | "HTML"
  | "CSS"
  | "JavaScript"
  | "TypeScript"
  | "Objective C"
  | "Python"
  | "Node.js";

export const DATA: Data = {
  aboutMe: {
    __html: `
    Hi, I'm Chappy Asel 👋
    <br/><br/>
    I'm a self-driven software engineer eager to branch out and continue to
    expand on my breadth of knowledge and experience. I graduated from the
    University of Washington with a BS in Computer Science and a minor in
    Entrepreneurship. In September 2021 I joined the TDG Software team at
    [Apple](https://www.apple.com) as a full-time AR/VR software engineer and
    am based in Palo Alto, California.
    <br/><br/>
    In the past, I have had the privilege of working for a variety of
    companies, including
    [Apple](https://www.apple.com),
    [Meta](https://about.meta.com/),
    [Lime](https://www.li.me),
    [Xevo](https://www.xevo.com),
    [Suplari](https://www.suplari.com),
    among many others. While working at each of these companies, I have gained
    valuable insight into how all classes of companies function, from
    world-class established corporations maintaining efficient operation and
    market dominance to the behavior and scaling of stealth startups. Time and
    time again, I have witnessed firsthand how effective leaders and
    cutting-edge products are forged from positive, electric work environments.
    <br/><br/>
    Beyond developing products that solve real-world problems to improve
    people's lives, I enjoy challenging myself physically through weightlifting,
    organized endurance events, and the occasional hike. I also enjoy spending
    time with family and friends whenever I can find the time.
    <br/><br/>
    Below is a list of some of my recent personal projects. I have published two
    of these projects,
    [Homework App](https://apps.apple.com/us/app/id1097438761)
    and
    [Weightlifting App](https://apps.apple.com/us/app/id1266077653),
    to the iOS App Store which have a combined 400k+ installs. Homework App
    was acquired in early 2019 by a private investor with which I negotiated
    the terms personally.
    <br/><br/>
    For more details on each project, feel free to click on each of their
    respective links below. If you have any further questions regarding my past
    work experience or credentials please feel free to read through my
    [LinkedIn](https://www.linkedin.com/in/chappyasel/)
    or
    [reach out](mailto:chappyasel@gmail.com)
    via the email listed at the top of my resume.
    `.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>'),
  },
  contacts: [
    {
      name: "LinkedIn",
      link: "https://www.linkedin.com/in/chappyasel/",
      image: "linkedin.png",
    },
    {
      name: "Github",
      link: "https://github.com/chappyasel",
      image: "github.png",
    },
    {
      name: "Medium",
      link: "https://medium.com/@chappyasel",
      image: "medium.png",
    },
    {
      name: "Twitter",
      link: "https://twitter.com/chappyasel",
      image: "twitter.png",
    },
    {
      name: "Email",
      link: "mailto:chappyasel@gmail.com",
      image: "email.png",
    },
    {
      name: "Facebook",
      link: "https://www.facebook.com/chappy.asel",
      image: "facebook.png",
    },
    {
      name: "Instagram",
      link: "https://www.instagram.com/chappyasel/",
      image: "instagram.png",
    },
  ],
  projects: {
    languages: [
      "HTML",
      "CSS",
      "JavaScript",
      "TypeScript",
      "Objective C",
      "Python",
      "Node.js",
    ],
    list: [
      {
        name: "Weightlifting App",
        link: "https://apps.apple.com/us/app/id1266077653",
        image: "weightlifting.jpg",
        languages: ["Objective C"],
      },
      {
        name: "Homework App",
        link: "https://apps.apple.com/us/app/id1097438761",
        image: "homework.jpg",
        languages: ["Objective C"],
      },
      {
        name: "Web Experiments",
        link: "https://github.com/chappyasel/WebExperiments_Backend",
        image: "web-exp.jpg",
        languages: ["HTML", "CSS", "JavaScript", "Node.js"],
      },
      {
        name: "Fantasy Basketball",
        link: "https://github.com/chappyasel/FantasyBasketball_iOS",
        image: "fantasy.jpg",
        languages: ["Objective C"],
      },
      {
        name: "Weightlifting App ML",
        link: "https://github.com/chappyasel/WeightliftingAppML_Python",
        image: "weightlifting-ml.jpg",
        languages: ["Python"],
      },
      {
        name: "Rotoworld ML",
        link: "https://github.com/chappyasel/RotoworldML_Python",
        image: "rotoworld-ml.jpg",
        languages: ["Python"],
      },
      {
        name: "Liar's Dice",
        link: "/liarsdice",
        languages: ["TypeScript"],
      },
    ],
  },
};
