using UnityEngine;
using System.Collections;
using UnityEngine.UI;

public class BallSelf : MonoBehaviour {

    float velocity = 1.0f, size = 1,cattime;
    public Material[] rainbow = new Material[7];
    public AudioClip soundca, sounddr, soundmi;
    int i,colors=7;
    bool l = false, r = false, hadcon = true, cat = false,
        hadin = false, autodrop = false, played = false, free = false;
    GameObject text,text1,text2,cam,cosli,sisli,spsli;
    GameObject leftarm,rightarm,leftcoll,rightcoll,parent;
    
	// Use this for initialization
	void Start () {
        cosli = GameObject.Find("Slider");
        sisli = GameObject.Find("Slider (1)");
        spsli = GameObject.Find("Slider (2)");
        leftcoll= GameObject.Find("leftcoll");
        rightcoll = GameObject.Find("rightcoll");
        leftarm = GameObject.Find("leftarm");
        rightarm = GameObject.Find("rightarm");
        colors = Mathf.FloorToInt(cosli.GetComponent<Slider>().value);
        i = Mathf.FloorToInt(Random.value * colors);
        if (i == colors) i-=1;
        this.GetComponent<Renderer>().material =rainbow[i];

        size = sisli.GetComponent<Slider>().value;
        if (GameObject.Find("Option (1)").GetComponent<OnOff>().israndom)
        {
            size = Random.Range(0.5f,size);
        }
        transform.localScale *= (size*0.9f);

        velocity = spsli.GetComponent<Slider>().value;
        if (GameObject.Find("Option (2)").GetComponent<OnOff>().israndom)
        {
            velocity = Random.Range(0.1f, velocity);
        }
        //Destroy(this.gameObject, 60);
        text = GameObject.Find("Realscore/score");
        text1 = GameObject.Find("Realscore/score");
        text2 = GameObject.Find("Realscore/score");
        cam = GameObject.Find("Main Camera");
    }
	
	// Update is called once per frame
	void Update () {
        if (transform.position.z < -5)
        {
            if (!played&&!this.GetComponent<AudioSource>().isPlaying)
            {
                leftarm.GetComponent<MoveArm>().mdistance = 150;
                played = true;
                this.GetComponent<AudioSource>().clip = soundmi;
                this.GetComponent<AudioSource>().Play();
                text2.GetComponent<Text>().text = (int.Parse(text2.GetComponent<Text>().text) - 1).ToString();
                cam.GetComponent<CreateBall>().conti = true;
                cam.GetComponent<CreateBall>().ballcount++;
                Destroy(this.gameObject, 0.5f);
            }
        }
        if (leftarm.GetComponent<MoveArm>().auto)
            if (transform.position.z < 150&&!cat&&!played)
                if (transform.position.z < leftarm.GetComponent<MoveArm>().mdistance)
                {
                    leftarm.GetComponent<MoveArm>().mdistance = transform.position.z;
                    leftarm.GetComponent<MoveArm>().mx = transform.position.x;
                    leftarm.GetComponent<MoveArm>().my = transform.position.y;
                    leftarm.GetComponent<MoveArm>().mspeed = velocity;
                }
        if (!cat&&cam.GetComponent<CreateBall>().start) transform.Translate(Vector3.back*velocity);
        if (cam.GetComponent<CreateBall>().stop|| cam.GetComponent<CreateBall>().modeswitch)
            Destroy(this.gameObject);
        if (cat)
            if ((!free && leftarm.GetComponent<MoveArm>().auto&&Time.time-cattime>0.5f) 
                || (Input.GetButtonDown(cam.GetComponent<CreateBall>().dropkey) || autodrop))
            {
                this.gameObject.transform.SetParent(null);
                this.gameObject.GetComponent<Rigidbody>().useGravity = true;
                free = true;
                if (hadcon)
                {
                    cam.GetComponent<CreateBall>().conti = true;
                    cam.GetComponent<CreateBall>().ballcount++;
                    leftarm.GetComponent<MoveArm>().mdistance = 150;
                    hadcon = false;
                }
            }
	}

    void OnTriggerEnter(Collider other)
    {
        if (other.gameObject.name == "destroy")
        {
            Destroy(this.gameObject, 1);
        }
        else if (other.gameObject.name == "autodrop")
        {
            autodrop = true;
        }
        else if (other.gameObject.name == "leftcoll")
        {
            l = true;
        }
        else if (other.gameObject.name == "rightcoll")
        {
            r = true;
        }
        if (!cat&&l&&r)
        {
            leftarm.GetComponent<Animation>().Play();
            rightarm.GetComponent<Animation>().Play();
            this.GetComponent<AudioSource>().clip = soundca;
            this.GetComponent<AudioSource>().Play();
            cat = true;
            cattime = Time.time;
            if (Random.value < 0.5f)
            {
                parent = leftcoll;
            }
            else parent = rightcoll;
            this.gameObject.transform.parent = parent.transform;
            this.gameObject.transform.position = parent.transform.position;
            if (!leftarm.GetComponent<MoveArm>().auto)
                text.GetComponent<Text>().text = (int.Parse(text.GetComponent<Text>().text) + 1).ToString();
        }
    }

    void OnCollisionEnter(Collision other)
    {
        if (other.gameObject.name == "Terrain")
        {
            Destroy(this.gameObject,1);
        }
        if (other.gameObject.name != "Terrain")
        {
            //Debug.Log(this.gameObject.GetComponent<Renderer>().material.name);
            //Debug.Log(other.gameObject.GetComponent<Renderer>().material.name);
            if (!hadin&&other.gameObject.name!="Ball(Clone)")
                if (other.gameObject.GetComponent<Renderer>().material.name ==
                  this.gameObject.GetComponent<Renderer>().material.name)
                {
                    this.GetComponent<AudioSource>().clip = sounddr;
                    this.GetComponent<AudioSource>().Play();
                    //this.gameObject.transform.localScale -= new Vector3(1, 1, 1);
                    //text1.GetComponent<Text>().text = (int.Parse(text1.GetComponent<Text>().text) + 1).ToString();
                    hadin = true;
                }
        }
    }
}
