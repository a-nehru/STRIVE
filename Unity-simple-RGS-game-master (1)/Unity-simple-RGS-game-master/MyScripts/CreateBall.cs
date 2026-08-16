using UnityEngine;
using System.Collections;
using UnityEngine.UI;

public class CreateBall : MonoBehaviour {

    float gap=1.0f;
    float[] x = {-4f,-2.4f,-0.8f,0.8f,2.4f,4f},y= {6.5f,8f,10f};
    public GameObject autodrop,leftarm,rightarm,ball,stext,te1,te2,te3,ranswi,gaptext,groove,stage,countdown;
    float time, timeswi;
    int i, j, condition = 0, record = 0, ballc = 0,gametimes=1, balllimit = 6;
    public int ballcount = 0,looptimes=20;
    public float conditioninter = 5.0f;
    public bool start = false, stop = false, modeswitch = false, modeswitch2 = true;
    public Slider gapsli;
    bool gapmode = false, avail = true, first = true;
    public bool conti = false;
    public string dropkey="Fire3";
    
	// Use this for initialization
	void Start () {
        autodrop.SetActive(false);
        time = Time.time;
        stage.SetActive(false);
        groove.SetActive(false);
	}
	
	// Update is called once per frame
	void Update () {
        if (start)
        {
            switch (condition)
            {
                case 1:
                    condition1();
                    break;
                case 2:
                    condition2();
                    break;
                case 3:
                    condition3();
                    break;
                case 4:
                    condition4();
                    break;
                case 0:
                    condition0();
                    break;
                default:
                    break;
            }
        }
    }

    void condition1()
    {
        groove.SetActive(false);
        dropkey = "Fire3";
        if (ranswi.GetComponent<OnOff>().israndom)
            gap = Random.Range(0.1f, gapsli.value);
        else gap = gapsli.value;
        if (modeswitch && modeswitch2)
        {
            timeswi = Time.time;
            modeswitch2 = false;
        }
        if (modeswitch && Time.time - timeswi > 0.5f)
        {
            modeswitch = false;
            conti = true;
        }
        if ((gapmode && (Time.time - time > gap)) || (!gapmode && conti))
        {
            conti = false;
            i = Mathf.FloorToInt(Random.value * 6);
            if (i == 6) i = 5;
            j = Mathf.FloorToInt(Random.value * 3);
            if (j == 3) j = 2;
            time = Time.time;
            if (ballc<balllimit) Instantiate(ball, new Vector3(x[i], y[j], 200), Quaternion.identity);
            ballc++;
        }
        if (ballcount >= balllimit)
        {
            condition = 0;
            first = true;
        }
    }

    void condition2()
    {
        dropkey = "Fire2";
        if (ranswi.GetComponent<OnOff>().israndom)
            gap = Random.Range(0.1f, gapsli.value);
        else gap = gapsli.value;
        if (modeswitch && modeswitch2)
        {
            timeswi = Time.time;
            modeswitch2 = false;
        }
        if (modeswitch && Time.time - timeswi > 0.5f)
        {
            modeswitch = false;
            conti = true;
        }
        if ((gapmode && (Time.time - time > gap)) || (!gapmode && conti))
        {
            conti = false;
            i = Mathf.FloorToInt(Random.value * 6);
            if (i == 6) i = 5;
            j = Mathf.FloorToInt(Random.value * 3);
            if (j == 3) j = 2;
            time = Time.time;
            if (ballc < balllimit) Instantiate(ball, new Vector3(x[i], y[j], 200), Quaternion.identity);
            ballc++;
        }
        if (ballcount >= balllimit)
        {
            condition = 0;
            first = true;
        }
    }
    void condition3()
    {
        dropkey = "Fire3";
        groove.SetActive(true);
        if (ranswi.GetComponent<OnOff>().israndom)
            gap = Random.Range(0.1f, gapsli.value);
        else gap = gapsli.value;
        if (modeswitch && modeswitch2)
        {
            timeswi = Time.time;
            modeswitch2 = false;
        }
        if (modeswitch && Time.time - timeswi > 0.5f)
        {
            modeswitch = false;
            conti = true;
        }
        if ((gapmode && (Time.time - time > gap)) || (!gapmode && conti))
        {
            conti = false;
            i = Mathf.FloorToInt(Random.value * 6);
            if (i == 6) i = 5;
            j = Mathf.FloorToInt(Random.value * 3);
            if (j == 3) j = 2;
            time = Time.time;
            if (ballc < balllimit) Instantiate(ball, new Vector3(x[i], y[j], 200), Quaternion.identity);
            ballc++;
        }
        if (ballcount >= balllimit)
        {
            condition = 0;
            first = true;
        }
    }

    void condition4()
    {
        dropkey = "Fire2";
        autodrop.SetActive(true);
        if (ranswi.GetComponent<OnOff>().israndom)
            gap = Random.Range(0.1f, gapsli.value);
        else gap = gapsli.value;
        if (modeswitch && modeswitch2)
        {
            timeswi = Time.time;
            modeswitch2 = false;
        }
        if (modeswitch && Time.time - timeswi > 0.5f)
        {
            modeswitch = false;
            conti = true;
        }
        if ((gapmode && (Time.time - time > gap)) || (!gapmode && conti))
        {
            conti = false;
            i = Mathf.FloorToInt(Random.value * 6);
            if (i == 6) i = 5;
            j = Mathf.FloorToInt(Random.value * 3);
            if (j == 3) j = 2;
            time = Time.time;
            if (ballc < balllimit) Instantiate(ball, new Vector3(x[i], y[j], 200), Quaternion.identity);
            ballc++;
        }
        if (ballcount >= balllimit)
        {
            gametimes++;
            condition = 0;
            autodrop.SetActive(false);
            first = true;
        }
    }

    void condition0()
    {
        if (first)
        {
            ballcount = 0;
            time = Time.time;
            first = false;
            stage.SetActive(true);
            te1.GetComponent<Text>().text = gametimes.ToString();
            if (gametimes > looptimes)
            {
                stopc();
                return;
            }
            switch (record)
            {
                case 0:
                    stage.GetComponent<Text>().text = "Stage 1:Active";
                    leftarm.GetComponent<MoveArm>().auto = false;
                    rightarm.GetComponent<MoveArmR>().auto = false;
                    groove.SetActive(false);
                    break;
                case 1:
                    stage.GetComponent<Text>().text = "Stage 2:Observation";
                    groove.SetActive(false);
                    leftarm.GetComponent<MoveArm>().auto = true;
                    rightarm.GetComponent<MoveArmR>().auto = true;
                    leftarm.transform.position = new Vector3(-1.2f,5,6.5f);
                    rightarm.transform.position = new Vector3(1.2f, 5, 6.5f);
                    //leftarm.GetComponent<MoveArm>().mdistance = 150;
                    break;
                case 2:
                    stage.GetComponent<Text>().text = "Stage 3:Match and drop";
                    leftarm.GetComponent<MoveArm>().auto = false;
                    rightarm.GetComponent<MoveArmR>().auto = false;
                    break;
                case 3:
                    stage.GetComponent<Text>().text = "Stage 4:Move down";
                    break;
                case 4:
                    stage.GetComponent<Text>().text = "Stage 1:Active";
                    break;
                default:
                    break;
            }
        }
        countdown.GetComponent<Text>().text = (conditioninter-Time.time + time).ToString("f0");
        if (Time.time - time > conditioninter)
        {
            if (record >= 4) record = 0;
            record++;   
            condition = record;
            first = true;
            ballcount = 0;
            ballc = 0;
            conti = true;
            stage.SetActive(false);
        }
    }
    public void Click()
    {
        start = !start;
        if (stext.GetComponent<Text>().text == "Start")
        { 
            te1.GetComponent<Text>().text = 1.ToString();
            te2.GetComponent<Text>().text = 0.ToString();
            te3.GetComponent<Text>().text = 0.ToString();
        }
        if (start)
        {
            stop = false;
            countdown.SetActive(true);
            stext.GetComponent<Text>().text = "Pause";
            if (avail)
            {
                conti = true;
                avail = false;
            }
        }
        else
        {
            stext.GetComponent<Text>().text = "Resume";
        }
    }

    public void stopc()
    {
        stop = true;
        start = false;
        stext.GetComponent<Text>().text = "Start";
        avail = true;
        first = true;
        leftarm.GetComponent<MoveArm>().mdistance = 150;
        autodrop.SetActive(false);
        stage.SetActive(true);
        stage.GetComponent<Text>().text = "Game Over";
        countdown.SetActive(false);
        //groove.SetActive(false);
        condition = 0;
        record = 0;
        ballc = 0;
        ballcount = 0;
        gametimes = 1;
        conti = false;
    }

    public void modeclick()
    {
        gapmode = !gapmode;
        if (gapmode)
        {
            gaptext.GetComponent<Text>().text = "Mode:continuous";
        }
        else
        {
            gaptext.GetComponent<Text>().text = "Mode:wait";
            modeswitch = true;
            modeswitch2 = true;
        }
    }
}
